/**
 * @file barber-schedule-set/index.js — 理发师排班设置与时段生成云函数
 *
 * 【业务定位】
 * 理发师在排班管理页（pages/barber/schedule/）选择某一天的上班起止时间后，
 * 提交到本云函数完成两件事：
 *   1. 写入/更新 barber_schedules 集合中当天的排班记录
 *   2. 按 5 分钟粒度生成 time_slots 文档（状态默认 AVAILABLE）
 *
 * 【时段生成规则】
 *   - 以 SLOT_STEP_MIN（5分钟）为粒度，在 [workStart, workEnd) 区间逐一生成
 *   - 午休窗口（12:00-13:00）和 晚间窗口（18:00-19:00）内的时段跳过，不生成
 *   - 已存在的 time_slots 文档一律跳过（不覆盖，避免误清掉已预约的占用状态）
 *   - 全部新增时段通过 collection.add() 批量写入，降低超时风险
 *
 * 【幂等性设计】
 * 多次提交同一天排班时，已存在的 AVAILABLE 时段不会被重复创建，
 * 已被 BOOKED 的时段不受影响，排班调整只新增缺失时段。
 *
 * 【可预约统计返回值】
 * 函数返回 { created, existed, bookable } 统计，
 * 前端可据此提示"共生成 N 个时段，可预约 M 个"，辅助理发师了解排班效果。
 *
 * 【引入的工具说明】
 *   SLOT_STEP_MIN      : 时段步长（5分钟）
 *   REST_GAP_MIN       : 服务后缓冲时间（默认 5 分钟），影响可预约窗口计算
 *   timeToMinutes      : "HH:MM" → 分钟数，用于时间区间运算
 *   minutesToTime      : 分钟数 → "HH:MM"，将数字转回时间字符串写入数据库
 *   isAlignedToSlotStep: 时间是否对齐 5 分钟粒度，排班起止时间须对齐才有效
 *   getChinaDateString : 获取北京时间当前日期字符串，用于"今天"边界判断
 *   resolveAssignedServiceForBarber: 获取理发师被分配的服务项目列表（含时长），
 *                        统计可预约窗口时需要知道服务时长
 */
const {
  withResponse,
  ApiError,
  ERROR_CODES,
  requireRole,
  SLOT_STEP_MIN,
  REST_GAP_MIN,
  isValidBookingDate,
  timeToMinutes,
  minutesToTime,
  isAlignedToSlotStep,
  getChinaDateString,
  toChinaTimestamp,
  resolveAssignedServiceForBarber
} = require('sb-common');

// 午休/晚间休息窗口：窗口内时段不生成（避免排班期间的休息时段被顾客占用）
const BREAK_WINDOWS = [
  { start: '12:00', end: '13:00' },
  { start: '18:00', end: '19:00' }
];

// 校验是否对齐粒度
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
  if (!isValidBookingDate(date)) {
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
  if (!isAlignedToSlotStep(startMin) || !isAlignedToSlotStep(endMin)) {
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
  const assignedService = await resolveAssignedServiceForBarber(db, {
    storeId,
    barberId,
    defaultDurationMin: 30,
    defaultName: '默认服务'
  });
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
