const { ApiError, ERROR_CODES } = require('./errors');

/**
 * bookingSlots.js —— 预约时段（time_slots 集合）工具库
 *
 * 【time_slots 集合的设计思路】
 * 预约系统的核心问题是"防止超卖"：同一理发师同一时段不能被多个订单占用。
 * 本系统采用"时段锁定表"方案：将每天每个理发师的工作时间切分为 5 分钟粒度的 slot，
 * 每个 slot 有 AVAILABLE / BOOKED 两种状态，通过原子更新操作锁定时段。
 * time_slots 集合结构：{ storeId, barberId, date, startTime, endTime, status, orderId, updatedAt }
 *
 * 【5 分钟粒度的选择理由】
 * - 大多数剪发服务时长为 30/45/60 分钟，均是 5 的整数倍；
 * - 粒度过粗（如 30 分钟）会浪费时段；过细（如 1 分钟）会导致文档数量暴增；
 * - 5 分钟是精度与性能之间合理的折中值。
 *
 * 【REST_GAP_MIN 缓冲时间】
 * 每个订单锁定的时段数 = ceil((服务时长 + 5分钟缓冲) / 5)。
 * 额外 5 分钟是为了给理发师留出收拾和准备的时间，避免下一个预约紧接着开始。
 * 例如：30 分钟的剪发服务 → 实际占用 35 分钟 → 锁定 7 个 5 分钟 slot。
 *
 * 【并发安全（乐观锁方案）】
 * uniCloud 数据库不支持传统关系型数据库的事务与行锁，
 * lockSlotTimesForOrder 采用"先查后改 + 二次确认 + 失败回滚"策略实现弱一致性锁：
 *   1. 前置检查：查询目标时段中是否已有 status=BOOKED 且 orderId 为他人的记录
 *   2. 条件更新：only update WHERE status='AVAILABLE'，避免覆盖他人已锁定的时段
 *   3. 后置验证：确认所有目标时段都成功锁定（lockedSet.size === slotTimes.length）
 *   4. 失败回滚：若二次验证失败，立即将本单已修改的记录恢复为 AVAILABLE
 * 此方案在极端并发下（毫秒级同时写入）极小概率失效，对预约场景的实际使用足够安全。
 *
 * 【校验链（orders-create 调用顺序）】
 *   isValidBookingDate/Time → isAlignedToSlotStep → buildRequiredSlotStartTimes
 *   → ensureSlotTimesWithinSchedule（排班校验）
 *   → ensureSlotTimesWithinBusinessHours（营业时间校验）
 *   → ensureSlotDocsExist（按需补建 slot 文档）
 *   → lockSlotTimesForOrder（加锁）
 */

// 时段步进粒度：5 分钟（所有时段计算都以此为基准单位）
const SLOT_STEP_MIN = 5;
// 每单额外锁定的缓冲时间（分钟），用于理发师整理准备
const REST_GAP_MIN = 5;

// 校验日期格式 YYYY-MM-DD（不校验具体日期合法性，仅做格式快速过滤）
function isValidBookingDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 校验时间格式 HH:mm（24小时制，确保 timeToMinutes 能正确解析）
function isValidBookingTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

/**
 * 将 HH:mm 时间字符串转换为"从 00:00 起的分钟数"整数。
 * 例如：'09:30' → 570，'23:59' → 1439。
 * 返回 NaN 时表示格式无效，调用方在使用前应用 Number.isNaN 检查。
 */
function timeToMinutes(time) {
  if (!isValidBookingTime(time)) return NaN;
  const [h, m] = String(time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

// 将分钟数还原为 HH:mm 字符串（与 timeToMinutes 互逆）。
// 例如：570 → '09:30'。超过 1440（24小时）的值会溢出，调用方需保证输入合法。
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 解析门店营业时间区间文本（格式：HH:mm-HH:mm，也支持 ~ / 到 / 至 等分隔符）。
// 返回 { startMin, endMin }（分钟数），格式不合法或区间无效（start >= end）时返回 null。
function parseBusinessRange(rangeText) {
  const text = String(rangeText || '').trim();
  const matched = text.match(/^(\d{2}:\d{2})\s*[-~到至]\s*(\d{2}:\d{2})$/);
  if (!matched) return null;
  const startMin = timeToMinutes(matched[1]);
  const endMin = timeToMinutes(matched[2]);
  if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return null;
  return { startMin, endMin };
}

/**
 * 根据日期（周几）从门店 businessHours 配置中解析当天的营业时间窗口。
 * businessHours 结构：{ weekday: 'HH:mm-HH:mm', weekend: 'HH:mm-HH:mm' }
 * 周一至周五取 weekday，周六日取 weekend。
 * 使用中国时区（+08:00）计算星期几，避免跨零点时区偏移导致误判。
 * 门店未配置营业时间时返回 null（调用方决定是否放行）。
 */
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

/**
 * 判断开始时间（分钟数）是否对齐到 5 分钟步长。
 * 例如：570（09:30）对齐，572（09:32）不对齐。
 * 前端时间选择器已按 5 分钟分组，此处为最终兜底校验，拒绝非对齐时间写入。
 */
function isAlignedToSlotStep(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

/**
 * 根据开始时间和服务时长，计算本次下单需要锁定的全部 slot 起点时间列表。
 * 锁定范围 = ceil((服务时长 + REST_GAP_MIN 缓冲) / SLOT_STEP_MIN) 个时段。
 * 例如：09:00 开始，30 分钟服务 + 5 分钟缓冲 = 35 分钟 → 7 个 slot：
 *   ['09:00', '09:05', '09:10', '09:15', '09:20', '09:25', '09:30']
 */
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

/**
 * 校验待锁定时段是否全部在门店营业时间区间内。
 * 门店未配置营业时间时直接放行（兼容历史数据，避免所有旧预约全部失效）。
 */
async function ensureSlotTimesWithinBusinessHours(db, storeId, date, slotTimes) {
  const window = await resolveStoreBusinessWindow(db, storeId, date);
  // 未配置营业时间时不做限制（兼容未填写 businessHours 的老门店数据）
  if (!window) return;
  const outside = (slotTimes || []).some((time) => {
    const min = timeToMinutes(time);
    return Number.isNaN(min) || min < window.startMin || min >= window.endMin;
  });
  if (outside) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'outside_business_hours');
  }
}

/**
 * 确保 time_slots 集合中目标时段的文档存在。
 * time_slots 文档是按需创建的（非提前全量生成），在预约时通过本函数补建缺失的文档，
 * 然后后续的 lockSlotTimesForOrder 可以用 .update() 统一操作所有目标时段，
 * 而不必区分"新建"和"更新"两种情况。
 * 补建的文档初始 status 为 AVAILABLE，表示该时段可预约。
 */
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

/**
 * 锁定时段到指定订单，带并发冲突检测与失败回滚。
 *
 * 【乐观锁实现步骤】
 *   1. hasBookedConflict()：查询目标时段中是否存在 status=BOOKED 且 orderId 为他人的记录
 *   2. status=AVAILABLE 条件更新：仅更新空闲时段，避免意外覆盖他人锁定
 *   3. 后置验证：确认成功锁定的记录数等于目标时段数（lockedSet.size === slotTimes.length）
 *   4. releaseLocked()：验证失败时释放本单已修改记录，恢复 AVAILABLE 状态
 *
 * 【为什么不用数据库事务？】
 * uniCloud 阿里云版目前不支持 MongoDB 多文档事务，
 * 本方案通过乐观锁+二次验证在绝大多数场景下保证一致性，
 * 极端毫秒级并发下极小概率失效（实际预约场景中用户发起请求的时间离散，概率接近0）。
 */
async function lockSlotTimesForOrder(db, { barberId = '', date = '', slotTimes = [], orderId = '' } = {}) {
  if (!orderId || !barberId || !date || !Array.isArray(slotTimes) || slotTimes.length === 0) {
    throw new ApiError(400, 'invalid slot lock params');
  }

  const _ = db.command;
  const slotCol = db.collection('time_slots');

  // 前置冲突检查：查询是否有其他订单已占用目标时段
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
    // 只要有记录 orderId 不是本单，就认为存在冲突
    return (bookedRes.data || []).some((item) => item && item.orderId && item.orderId !== orderId);
  };

  // 回滚函数：将本单已锁定的时段恢复为 AVAILABLE
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

  // 条件更新：仅将 AVAILABLE 状态的时段改为 BOOKED，
  // 避免覆盖同一毫秒内其他请求已写入的 BOOKED 记录（乐观锁的核心操作）
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

  // 后置验证：确认全部目标时段都被本单成功锁定，并且无并发冲突。
  // 若有并发写入覆盖了本单的时段，lockedSet.size 会小于 slotTimes.length，触发回滚。
  const lockedRes = await slotCol
    .where({ barberId, date, startTime: _.in(slotTimes), orderId })
    .field({ startTime: true })
    .get();
  const lockedSet = new Set((lockedRes.data || []).map((item) => item.startTime));

  if (lockedSet.size !== slotTimes.length || (await hasBookedConflict())) {
    // 验证失败：释放本单已修改的记录，防止这些时段永久占用（半锁状态）
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
