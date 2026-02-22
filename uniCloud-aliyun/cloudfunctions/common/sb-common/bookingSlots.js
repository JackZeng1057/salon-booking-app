const { ApiError, ERROR_CODES } = require('./errors');

/**
 * 预约时段（time_slots）工具
 * 目标：
 * 1) 统一处理时间格式与时段步进
 * 2) 校验预约是否落在排班内
 * 3) 在并发场景下安全锁定时段，避免超卖
 */

// 时段粒度：5 分钟
const SLOT_STEP_MIN = 5;
// 每单默认额外预留 5 分钟缓冲（打扫/准备等）
const REST_GAP_MIN = 5;

// 校验日期格式 YYYY-MM-DD
function isValidBookingDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 校验时间格式 HH:mm
function isValidBookingTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

// 将 HH:mm 转换为“自 00:00 起的分钟数”
function timeToMinutes(time) {
  if (!isValidBookingTime(time)) return NaN;
  const [h, m] = String(time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

// 将分钟数还原为 HH:mm
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 解析门店营业时间区间文本（HH:mm-HH:mm）
function parseBusinessRange(rangeText) {
  const text = String(rangeText || '').trim();
  const matched = text.match(/^(\d{2}:\d{2})\s*[-~到至]\s*(\d{2}:\d{2})$/);
  if (!matched) return null;
  const startMin = timeToMinutes(matched[1]);
  const endMin = timeToMinutes(matched[2]);
  if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return null;
  return { startMin, endMin };
}

// 按日期取门店营业窗口（工作日/周末）
async function resolveStoreBusinessWindow(db, storeId, date) {
  if (!storeId || !date) return null;
  const storeRes = await db
    .collection('stores')
    .doc(storeId)
    .field({ businessHours: true })
    .get();
  const store = storeRes.data && storeRes.data[0];
  const businessHours = (store && store.businessHours) || {};
  const day = new Date(`${date}T12:00:00+08:00`).getDay();
  const key = day === 0 || day === 6 ? 'weekend' : 'weekday';
  return parseBusinessRange(businessHours[key] || '');
}

// 判断开始时间是否对齐到 5 分钟步长
function isAlignedToSlotStep(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

// 根据开始时间与服务时长，计算本次下单需要锁定的时段起点列表
function buildRequiredSlotStartTimes(startTime, durationMin) {
  const startMin = timeToMinutes(startTime);
  const requiredMin = Number(durationMin || 0) + REST_GAP_MIN;
  const slotsNeeded = Math.ceil(requiredMin / SLOT_STEP_MIN);
  const list = [];
  for (let i = 0; i < slotsNeeded; i += 1) {
    list.push(minutesToTime(startMin + i * SLOT_STEP_MIN));
  }
  return list;
}

// 校验待锁定时段是否全部在理发师排班区间内
async function ensureSlotTimesWithinSchedule(db, barberId, date, slotTimes) {
  const scheduleRes = await db
    .collection('barber_schedules')
    .where({ barberId, date })
    .field({ workStart: true, workEnd: true })
    .limit(1)
    .get();
  const schedule = scheduleRes.data && scheduleRes.data[0];
  if (!schedule) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'schedule_not_set');
  }

  // 排班时间本身异常时直接拒绝预约
  const scheduleStartMin = timeToMinutes(schedule.workStart);
  const scheduleEndMin = timeToMinutes(schedule.workEnd);
  if (
    Number.isNaN(scheduleStartMin) ||
    Number.isNaN(scheduleEndMin) ||
    scheduleStartMin >= scheduleEndMin
  ) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'schedule_invalid');
  }

  const outside = (slotTimes || []).some((time) => {
    const min = timeToMinutes(time);
    return Number.isNaN(min) || min < scheduleStartMin || min >= scheduleEndMin;
  });
  if (outside) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'outside_schedule');
  }
}

// 校验待锁定时段是否全部在门店营业时间区间内
async function ensureSlotTimesWithinBusinessHours(db, storeId, date, slotTimes) {
  const window = await resolveStoreBusinessWindow(db, storeId, date);
  // 未配置营业时间时不限制，兼容历史数据
  if (!window) return;
  const outside = (slotTimes || []).some((time) => {
    const min = timeToMinutes(time);
    return Number.isNaN(min) || min < window.startMin || min >= window.endMin;
  });
  if (outside) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'outside_business_hours');
  }
}

// 确保 time_slots 文档存在；缺失则按 AVAILABLE 补建，便于后续统一 update 锁定
async function ensureSlotDocsExist(db, { storeId = '', barberId = '', date = '', slotTimes = [] } = {}) {
  if (!slotTimes.length) return;
  const _ = db.command;
  const existingRes = await db
    .collection('time_slots')
    .where({ barberId, date, startTime: _.in(slotTimes) })
    .field({ startTime: true })
    .get();

  const existing = new Set((existingRes.data || []).map((item) => item.startTime));
  const missing = slotTimes.filter((time) => !existing.has(time));
  if (!missing.length) return;

  const now = Date.now();
  const docs = missing.map((startTime) => {
    const startMin = timeToMinutes(startTime);
    return {
      storeId,
      barberId,
      date,
      startTime,
      endTime: minutesToTime(startMin + SLOT_STEP_MIN),
      status: 'AVAILABLE',
      updatedAt: now
    };
  });
  await db.collection('time_slots').add(docs);
}

// 锁定时段到指定订单，带冲突检测与失败回滚
async function lockSlotTimesForOrder(db, { barberId = '', date = '', slotTimes = [], orderId = '' } = {}) {
  if (!orderId || !barberId || !date || !Array.isArray(slotTimes) || slotTimes.length === 0) {
    throw new ApiError(400, 'invalid slot lock params');
  }

  const _ = db.command;
  const slotCol = db.collection('time_slots');

  // 检查是否已有其他订单占用目标时段
  const hasBookedConflict = async () => {
    const bookedRes = await slotCol
      .where({
        barberId,
        date,
        startTime: _.in(slotTimes),
        status: 'BOOKED'
      })
      .field({ startTime: true, orderId: true })
      .get();
    return (bookedRes.data || []).some((item) => item && item.orderId && item.orderId !== orderId);
  };

  // 锁定校验失败时，释放本单已占用时段
  const releaseLocked = async () => {
    await slotCol
      .where({ barberId, date, startTime: _.in(slotTimes), orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: Date.now()
      });
  };

  if (await hasBookedConflict()) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
  }

  // 仅将 AVAILABLE 时段改为 BOOKED，避免覆盖已有占用
  await slotCol
    .where({
      barberId,
      date,
      startTime: _.in(slotTimes),
      status: 'AVAILABLE'
    })
    .update({
      status: 'BOOKED',
      orderId,
      updatedAt: Date.now()
    });

  // 二次确认：必须“全量锁定成功且无并发冲突”才算成功
  const lockedRes = await slotCol
    .where({ barberId, date, startTime: _.in(slotTimes), orderId })
    .field({ startTime: true })
    .get();
  const lockedSet = new Set((lockedRes.data || []).map((item) => item.startTime));

  if (lockedSet.size !== slotTimes.length || (await hasBookedConflict())) {
    await releaseLocked();
    throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
  }
}

module.exports = {
  SLOT_STEP_MIN,
  REST_GAP_MIN,
  isValidBookingDate,
  isValidBookingTime,
  timeToMinutes,
  minutesToTime,
  isAlignedToSlotStep,
  buildRequiredSlotStartTimes,
  ensureSlotTimesWithinSchedule,
  ensureSlotTimesWithinBusinessHours,
  ensureSlotDocsExist,
  lockSlotTimesForOrder
};
