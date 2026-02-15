const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 排班设置与时段生成：
// 1) 按 5 分钟粒度生成当天/未来 N 天 AVAILABLE slots
// 2) 已存在时段一律跳过（不重复生成，不覆盖历史）
// 3) 批量写入，降低超时风险

// 校验日期格式是否为 YYYY-MM-DD
function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 校验时间格式是否为 HH:mm
function isValidTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

// 将 HH:mm 转换为分钟数（用于比较与步进）
function timeToMinutes(time) {
  if (!isValidTime(time)) return NaN;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

// 将分钟数转换回 HH:mm 字符串
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 校验是否对齐粒度
const SLOT_STEP_MIN = 5;
const REST_GAP_MIN = 5;
const BREAK_WINDOWS = [
  { start: '12:00', end: '13:00' },
  { start: '18:00', end: '19:00' }
];

// 校验是否对齐粒度
function ensureAligned(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

function isInBreakWindow(startMin) {
  return BREAK_WINDOWS.some((window) => {
    const windowStart = timeToMinutes(window.start);
    const windowEnd = timeToMinutes(window.end);
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return false;
    return startMin >= windowStart && startMin < windowEnd;
  });
}

function isWindowAvailable(statusMap, startMin, requiredSlots) {
  for (let i = 0; i < requiredSlots; i += 1) {
    const current = startMin + i * SLOT_STEP_MIN;
    const time = minutesToTime(current);
    if (statusMap.get(time) !== 'AVAILABLE') return false;
  }
  return true;
}

function calcBookableStats({
  beforeStatusMap,
  afterStatusMap,
  date,
  startMin,
  endMin,
  durationMin,
  nowTs
}) {
  const requiredMin = durationMin + REST_GAP_MIN;
  const requiredSlots = Math.ceil(requiredMin / SLOT_STEP_MIN);
  const stepMin = requiredMin;
  let created = 0;
  let existed = 0;
  let total = 0;
  const now = Number(nowTs || Date.now());
  const today = getChinaDateString(now);
  const isPastDate = date < today;

  for (let start = startMin; start + durationMin <= endMin; start += stepMin) {
    if (isPastDate) continue;
    if (isInBreakWindow(start)) continue;
    if (date === today) {
      const startMs = toChinaTimestamp(date, minutesToTime(start));
      if (startMs && startMs <= now) continue;
    }
    const beforeAvailable = isWindowAvailable(beforeStatusMap, start, requiredSlots);
    const afterAvailable = isWindowAvailable(afterStatusMap, start, requiredSlots);
    if (afterAvailable) {
      total += 1;
      if (beforeAvailable) {
        existed += 1;
      } else {
        created += 1;
      }
    }
  }
  return { created, existed, total, requiredMin };
}

function calcTotalBookable({
  statusMap,
  date,
  startMin,
  endMin,
  durationMin,
  nowTs
}) {
  const requiredMin = durationMin + REST_GAP_MIN;
  const requiredSlots = Math.ceil(requiredMin / SLOT_STEP_MIN);
  const stepMin = requiredMin;
  const now = Number(nowTs || Date.now());
  const today = getChinaDateString(now);
  const isPastDate = date < today;
  if (isPastDate) return 0;

  let total = 0;
  for (let start = startMin; start + durationMin <= endMin; start += stepMin) {
    if (isInBreakWindow(start)) continue;
    if (date === today) {
      const startMs = toChinaTimestamp(date, minutesToTime(start));
      if (startMs && startMs <= now) continue;
    }
    if (isWindowAvailable(statusMap, start, requiredSlots)) {
      total += 1;
    }
  }
  return total;
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function getChinaDateString(ts = Date.now()) {
  const china = new Date(ts + 8 * 60 * 60 * 1000);
  const y = china.getUTCFullYear();
  const m = pad2(china.getUTCMonth() + 1);
  const d = pad2(china.getUTCDate());
  return `${y}-${m}-${d}`;
}

function toChinaTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 0;
  return new Date(`${dateStr}T${timeStr}:00+08:00`).getTime();
}

async function fetchAllSlotsByDate(slotCol, barberId, date) {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;
  const list = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await slotCol
      .where({ barberId, date })
      .field({ startTime: true, status: true })
      .orderBy('startTime', 'asc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get();
    const batch = (res && res.data) || [];
    list.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return list;
}

async function resolveAssignedService(db, storeId, barberId) {
  const defaultService = { id: '', durationMin: 30, name: '默认服务' };
  if (!storeId || !barberId) return defaultService;

  const [serviceRes, barberRes] = await Promise.all([
    db
      .collection('services')
      .where({ storeId })
      .field({ _id: true, name: true, duration: true, durationMin: true })
      .orderBy('createdAt', 'desc')
      .get(),
    db
      .collection('users')
      .where({ storeId, role: 'barber' })
      .field({ _id: true })
      .orderBy('createdAt', 'desc')
      .get()
  ]);

  const serviceList = (serviceRes && serviceRes.data) || [];
  const barberList = (barberRes && barberRes.data) || [];
  const pairCount = Math.min(serviceList.length, barberList.length);
  const barberIndex = barberList.findIndex((item) => item && item._id === barberId);
  if (barberIndex < 0 || barberIndex >= pairCount) {
    return defaultService;
  }

  const service = serviceList[barberIndex] || {};
  const durationMin = Number(service.duration || service.durationMin || defaultService.durationMin);
  return {
    id: service._id || '',
    durationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : defaultService.durationMin,
    name: service.name || defaultService.name
  };
}

// 计算日期偏移（YYYY-MM-DD -> YYYY-MM-DD）
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 使用 UTC 中午时间计算偏移，避免时区边界导致跨天异常
  const utcTs = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  const date = new Date(utcTs);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 入口：理发师设置排班并生成 slots
exports.main = withResponse(async (event, context) => {
  // 权限校验：仅 barber / admin 可调用
  const user = await requireRole(['barber', 'admin'], event, context);

  // 读取入参
  const date = (event && event.date) || '';
  const workStart = (event && event.workStart) || '';
  const workEnd = (event && event.workEnd) || '';
  // 可选：生成未来 N 天（包含当天），默认为 1
  const generateDays = Number((event && event.generateDays) || 1);

  // 参数校验：必填 + 格式
  if (!date || !workStart || !workEnd) {
    throw new ApiError(400, 'date, workStart and workEnd required');
  }
  if (!isValidDate(date)) {
    throw new ApiError(400, 'invalid date format');
  }

  const startMin = timeToMinutes(workStart);
  const endMin = timeToMinutes(workEnd);
  // 校验时间合法性与大小关系
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
    throw new ApiError(400, 'invalid time format');
  }
  if (startMin >= endMin) {
    throw new ApiError(400, 'workStart must be earlier than workEnd');
  }
  // 强制时间对齐（减少前后端误差）
  if (!ensureAligned(startMin) || !ensureAligned(endMin)) {
    throw new ApiError(400, 'workStart/workEnd must align to slot step');
  }

  // 约束生成天数，避免误操作
  const safeDays = Number.isFinite(generateDays) ? Math.min(Math.max(generateDays, 1), 30) : 1;

  // 准备数据库实例与身份信息
  const db = uniCloud.database();
  const barberId = user.uid || user._id || user.userId;
  const storeId = user.storeId || '';

  // 理发师身份必须存在
  if (!barberId) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'barber not found');
  }

  // 目标集合
  const scheduleCol = db.collection('barber_schedules');
  const slotCol = db.collection('time_slots');

  // 统计生成结果
  let createdCount = 0;
  let existedCount = 0;
  let totalBookableCount = 0;
  let rawCreatedCount = 0;
  let rawExistedCount = 0;
  let skippedBookedCount = 0;
  let skippedDateCount = 0;
  const generatedDates = [];
  const BATCH_SIZE = 500;
  const assignedService = await resolveAssignedService(db, storeId, barberId);
  const durationMin = Number(assignedService.durationMin || 30);
  const nowTs = Date.now();

  // 生成某一天排班与 slots（幂等）
  async function upsertScheduleAndSlots(targetDate) {
    // 查找是否已存在该理发师当天排班
    const existingSchedule = await scheduleCol
      .where({ barberId, date: targetDate })
      .limit(1)
      .get();

    // 排班数据（仅保留必要字段）
    const scheduleData = {
      storeId,
      barberId,
      date: targetDate,
      workStart,
      workEnd,
      updatedAt: Date.now()
    };

    // 幂等写入排班：存在则更新，否则新增
    if (existingSchedule.data && existingSchedule.data[0]) {
      await scheduleCol.doc(existingSchedule.data[0]._id).update(scheduleData);
    } else {
      await scheduleCol.add(scheduleData);
    }

    // 一次性读取当天已存在的 slots
    const existing = await fetchAllSlotsByDate(slotCol, barberId, targetDate);
    const existingStartSet = new Set(existing.map((slot) => slot.startTime));
    const beforeStatusMap = new Map(
      existing.map((slot) => [slot.startTime, slot.status || 'AVAILABLE'])
    );
    const bookedSet = new Set(
      existing.filter((slot) => slot.status === 'BOOKED').map((slot) => slot.startTime)
    );

    const now = Date.now();
    const toInsert = [];
    for (let current = startMin; current < endMin; current += SLOT_STEP_MIN) {
      const startTime = minutesToTime(current);
      const endTime = minutesToTime(current + SLOT_STEP_MIN);
      if (existingStartSet.has(startTime)) {
        rawExistedCount += 1;
        if (bookedSet.has(startTime)) {
          skippedBookedCount += 1;
        }
        continue;
      }
      toInsert.push({
        storeId,
        barberId,
        date: targetDate,
        startTime,
        endTime,
        status: 'AVAILABLE',
        updatedAt: now
      });
    }
    if (toInsert.length === 0) {
      skippedDateCount += 1;
    }

    const afterStatusMap = new Map(beforeStatusMap);
    toInsert.forEach((slot) => {
      afterStatusMap.set(slot.startTime, 'AVAILABLE');
    });

    const dayBookable = calcBookableStats({
      beforeStatusMap,
      afterStatusMap,
      date: targetDate,
      startMin,
      endMin,
      durationMin,
      nowTs
    });
    createdCount += dayBookable.created;
    existedCount += dayBookable.existed;

    // 与预约查询口径对齐：排班窗口内缺失 5 分钟基础槽位按 AVAILABLE 参与可预约统计
    const effectiveStatusMap = new Map(afterStatusMap);
    for (let current = startMin; current < endMin; current += SLOT_STEP_MIN) {
      const time = minutesToTime(current);
      if (!effectiveStatusMap.has(time)) {
        effectiveStatusMap.set(time, 'AVAILABLE');
      }
    }
    totalBookableCount += calcTotalBookable({
      statusMap: effectiveStatusMap,
      date: targetDate,
      startMin,
      endMin,
      durationMin,
      nowTs
    });

    // 批量写入避免单次过大造成超时
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length) {
        await slotCol.add(batch);
        rawCreatedCount += batch.length;
      }
    }
  }

  // 支持生成未来多天（包含当天）
  for (let i = 0; i < safeDays; i += 1) {
    const targetDate = addDays(date, i);
    await upsertScheduleAndSlots(targetDate);
    generatedDates.push(targetDate);
  }

  // 返回生成统计给前端展示
  return {
    days: safeDays,
    generatedDates,
    createdCount,
    existedCount,
    totalBookableCount,
    rawCreatedCount,
    rawExistedCount,
    serviceId: assignedService.id || '',
    serviceName: assignedService.name || '默认服务',
    serviceDurationMin: durationMin,
    skippedBookedCount,
    skippedDateCount
  };
});
