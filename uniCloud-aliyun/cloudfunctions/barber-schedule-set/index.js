const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 排班设置与时段生成：
// 1) 按 5 分钟粒度生成当天/未来 N 天 AVAILABLE slots
// 2) 保留已 BOOKED 时段，避免覆盖历史预约
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

// 校验是否对齐粒度
function ensureAligned(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

// 计算日期偏移（YYYY-MM-DD -> YYYY-MM-DD）
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
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
  let skippedBookedCount = 0;
  const BATCH_SIZE = 500;

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
    const existingRes = await slotCol
      .where({ barberId, date: targetDate })
      .field({ startTime: true, status: true })
      .get();

    const existing = existingRes.data || [];
    const bookedSet = new Set(
      existing.filter((slot) => slot.status === 'BOOKED').map((slot) => slot.startTime)
    );
    skippedBookedCount += bookedSet.size;

    // 删除当天所有 AVAILABLE slots，避免逐条更新（BOOKED 会保留）
    if (existing.length > 0) {
      await slotCol.where({ barberId, date: targetDate, status: 'AVAILABLE' }).remove();
    }

    const now = Date.now();
    const toInsert = [];
    for (let current = startMin; current < endMin; current += SLOT_STEP_MIN) {
      const startTime = minutesToTime(current);
      const endTime = minutesToTime(current + SLOT_STEP_MIN);
      if (bookedSet.has(startTime)) {
        existedCount += 1;
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

    // 批量写入避免单次过大造成超时
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length) {
        await slotCol.add(batch);
        createdCount += batch.length;
      }
    }
  }

  // 支持生成未来多天（包含当天）
  for (let i = 0; i < safeDays; i += 1) {
    const targetDate = addDays(date, i);
    await upsertScheduleAndSlots(targetDate);
  }

  // 返回生成统计给前端展示
  return {
    days: safeDays,
    createdCount,
    existedCount,
    skippedBookedCount
  };
});
