/**
 * @file barber-slots-get/index.js — 查询理发师可预约时段
 *
 * 【业务定位】
 * 预约创建页（pages/order/create.vue）的核心数据源，
 * 负责将"理发师 + 日期 + 服务"三要素转换为前端可直接渲染的时段列表。
 *
 * 【可预约窗口计算逻辑（三重约束取交集）】
 *   ① 理发师排班区间（barber_schedules.workStart ~ workEnd）
 *   ② 门店营业时间（stores.businessHours.weekday / weekend）
 *   ③ 已占用/过期 slot（time_slots 集合实时状态）
 * 三者取交集后，以"服务时长 + REST_GAP_MIN（5 分钟缓冲）"为步进，
 * 生成最终可预约起始时间列表。
 *
 * 【时段状态枚举】
 *   - AVAILABLE：可预约；
 *   - BOOKED：已被他人预约（起始时段已占）；
 *   - UNAVAILABLE：服务时长内某中间 slot 被占（起始本身未占，但连续区间有障碍）；
 *   - EXPIRED：过期（当天距开始不足 5 分钟，或历史日期）。
 *
 * 【重复 slot 合并策略】
 * 同一 startTime 可能在 time_slots 中存在多条记录（历史原因/并发写入），
 * mergeSlotStatus() 按"最严格状态"合并（BOOKED > UNAVAILABLE > EXPIRED > AVAILABLE），
 * 确保前端不会误判已占用时段为可预约。
 *
 * 【分页读取 slots（PageSize=500）】
 * 云数据库单次查询默认上限 100，fetchAllSlotsByDate() 按 500 条分批读取，
 * 防止理发师某天 slot 记录超出单次限制时数据截断。
 *
 * 【休息时间段（BREAK_WINDOWS）】
 * 午休 12:00-13:00 和晚休 18:00-19:00 不允许作为起始时间，
 * 避免顾客预约到就餐时段影响服务质量。
 */
const {
  withResponse,
  ApiError,
  requireLogin,
  SLOT_STEP_MIN,
  REST_GAP_MIN,
  isValidBookingDate,
  timeToMinutes,
  minutesToTime,
  getChinaDateString,
  toChinaTimestamp
} = require('sb-common');

// 查询理发师可预约时段：
// - 以 5 分钟为基础粒度
// - 结合服务时长 + 5 分钟缓冲，生成可预约窗口
// - 午休/晚休窗口不可作为起始时间

// 休息时间段（起始时间落在该窗口内则不可预约）
const BREAK_WINDOWS = [
  { start: '12:00', end: '13:00' },
  { start: '18:00', end: '19:00' }
];

function normalizeSlotStatus(status) {
  const raw = String(status || 'AVAILABLE').toUpperCase();
  if (raw === 'BOOKED' || raw === 'UNAVAILABLE' || raw === 'EXPIRED' || raw === 'AVAILABLE') {
    return raw;
  }
  return 'AVAILABLE';
}

function mergeSlotStatus(current, incoming) {
  const priority = {
    AVAILABLE: 1,
    EXPIRED: 2,
    UNAVAILABLE: 3,
    BOOKED: 4
  };
  const cur = normalizeSlotStatus(current);
  const next = normalizeSlotStatus(incoming);
  return (priority[next] || 0) > (priority[cur] || 0) ? next : cur;
}

function isInBreakWindow(startMin) {
  return BREAK_WINDOWS.some((window) => {
    const windowStart = timeToMinutes(window.start);
    const windowEnd = timeToMinutes(window.end);
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return false;
    return startMin >= windowStart && startMin < windowEnd;
  });
}

function parseBusinessRange(rangeText) {
  const text = String(rangeText || '').trim();
  const matched = text.match(/^(\d{2}:\d{2})\s*[-~到至]\s*(\d{2}:\d{2})$/);
  if (!matched) return null;
  const startMin = timeToMinutes(matched[1]);
  const endMin = timeToMinutes(matched[2]);
  if (Number.isNaN(startMin) || Number.isNaN(endMin) || startMin >= endMin) return null;
  return { startMin, endMin };
}

async function resolveStoreBusinessWindow(db, { barberId = '', date = '', schedule = null } = {}) {
  let storeId = (schedule && schedule.storeId) || '';
  if (!storeId && barberId) {
    const barberRes = await db
      .collection('users')
      .doc(barberId)
      .field({ storeId: true })
      .get();
    const barber = barberRes.data && barberRes.data[0];
    storeId = (barber && barber.storeId) || '';
  }
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

async function fetchAllSlotsByDate(slotCol, barberId, date) {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;
  const list = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await slotCol
      .where({ barberId, date })
      .field({ startTime: true, endTime: true, status: true })
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

// 云函数入口：查询理发师某天 slots
exports.main = withResponse(async (event, context) => {
  // 权限校验：只要登录即可查询
  await requireLogin(event, context);

  // 读取入参
  const barberId = (event && event.barberId) || '';
  const date = (event && event.date) || '';
  // serviceId 当前仅透传保留扩展位
  const serviceId = (event && event.serviceId) || '';

  // 参数校验
  if (!barberId || !date) {
    throw new ApiError(400, 'barberId and date required');
  }
  if (!isValidBookingDate(date)) {
    throw new ApiError(400, 'invalid date format');
  }

  // 获取数据库实例
  const db = uniCloud.database();

  // 按理发师 + 日期查询 slots，并按 startTime 升序
  const slotCol = db.collection('time_slots');
  const slotList = await fetchAllSlotsByDate(slotCol, barberId, date);

  const scheduleRes = await db
    .collection('barber_schedules')
    .where({ barberId, date })
    .field({ workStart: true, workEnd: true, storeId: true })
    .limit(1)
    .get();
  const schedule = scheduleRes.data && scheduleRes.data[0];

  // 获取服务时长，用于筛选可预约时段（默认为 30 分钟）
  let durationMin = 30;
  if (serviceId) {
    const serviceRes = await db
      .collection('services')
      .doc(serviceId)
      .field({ duration: true, durationMin: true })
      .get();
    const service = serviceRes.data && serviceRes.data[0];
    durationMin = Number((service && (service.duration || service.durationMin)) || durationMin);
  }
  const requiredMin = durationMin + REST_GAP_MIN;
  const requiredSlots = Math.ceil(requiredMin / SLOT_STEP_MIN);

  // 仅返回需要的字段，避免无关数据泄露
  const now = Date.now();
  const bookingCutoffMs = now + 5 * 60 * 1000;
  const today = getChinaDateString(now);
  const isPastDate = date < today;

  // 同一 startTime 可能存在重复记录，按“最严格状态”合并，避免前端误判可约
  const slotMap = new Map();
  (slotList || []).forEach((item) => {
    const startTime = item && item.startTime;
    if (!startTime) return;
    const prev = slotMap.get(startTime);
    slotMap.set(startTime, {
      startTime,
      endTime: (prev && prev.endTime) || item.endTime || '',
      status: mergeSlotStatus(prev && prev.status, item && item.status)
    });
  });

  const rawSlots = Array.from(slotMap.values()).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

  // statusMap 统一承接数据库状态与前端“过期”判断
  const statusMap = new Map();
  rawSlots.forEach((slot) => {
    let status = slot.status || 'AVAILABLE';
    if (status !== 'BOOKED') {
      if (isPastDate) {
        status = 'EXPIRED';
      } else if (date === today) {
        const startMs = toChinaTimestamp(date, slot.startTime);
        if (startMs && startMs <= bookingCutoffMs) {
          status = 'EXPIRED';
        }
      }
    }
    statusMap.set(slot.startTime, status);
  });

  const scheduleStartMin = timeToMinutes(schedule && schedule.workStart);
  const scheduleEndMin = timeToMinutes(schedule && schedule.workEnd);

  // 默认以排班时间作为窗口边界，若无排班则退化为 slots 本身的边界
  let windowStartMin = scheduleStartMin;
  let windowEndMin = scheduleEndMin;

  if (Number.isNaN(windowStartMin) || Number.isNaN(windowEndMin)) {
    const startCandidates = rawSlots.map((slot) => timeToMinutes(slot.startTime)).filter((val) => !Number.isNaN(val));
    const endCandidates = rawSlots.map((slot) => timeToMinutes(slot.endTime)).filter((val) => !Number.isNaN(val));
    windowStartMin = startCandidates.length ? Math.min(...startCandidates) : NaN;
    windowEndMin = endCandidates.length ? Math.max(...endCandidates) : NaN;
  }

  if (Number.isNaN(windowStartMin) || Number.isNaN(windowEndMin)) {
    return [];
  }

  // 叠加门店营业时间窗口：最终可约区间为“门店营业时间 ∩ 理发师排班”
  const businessWindow = await resolveStoreBusinessWindow(db, { barberId, date, schedule });
  if (businessWindow) {
    windowStartMin = Math.max(windowStartMin, businessWindow.startMin);
    windowEndMin = Math.min(windowEndMin, businessWindow.endMin);
    if (windowStartMin >= windowEndMin) {
      return [];
    }
  }

  // 兜底填充缺失的 5 分钟 slot，避免前端出现“全部不可预约”的错觉
  for (let current = windowStartMin; current < windowEndMin; current += SLOT_STEP_MIN) {
    const startTime = minutesToTime(current);
    if (statusMap.has(startTime)) continue;
    let status = 'AVAILABLE';
    if (isPastDate) {
      status = 'EXPIRED';
    } else if (date === today) {
      const startMs = toChinaTimestamp(date, startTime);
      if (startMs && startMs <= bookingCutoffMs) {
        status = 'EXPIRED';
      }
    }
    statusMap.set(startTime, status);
  }

  // 以“服务时长 + 缓冲”作为预约窗口步进
  const stepMin = durationMin + REST_GAP_MIN;
  const slots = [];

  // 生成可预约窗口列表，并根据连续 slot 的状态判断是否可预约
  for (let start = windowStartMin; start + durationMin <= windowEndMin; start += stepMin) {
    if (isInBreakWindow(start)) {
      continue;
    }
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(start + durationMin);
    const startMs = toChinaTimestamp(date, startTime);

    if (isPastDate || (date === today && startMs && startMs <= bookingCutoffMs)) {
      slots.push({ startTime, endTime, status: 'EXPIRED', serviceId });
      continue;
    }

    let available = true;
    let bookedAtStart = false;
    for (let i = 0; i < requiredSlots; i += 1) {
      const curMin = start + i * SLOT_STEP_MIN;
      const curTime = minutesToTime(curMin);
      const curStatus = statusMap.get(curTime);
      if (!curStatus || curStatus === 'EXPIRED') {
        available = false;
        break;
      }
      if (curStatus === 'BOOKED') {
        if (curTime === startTime) {
          bookedAtStart = true;
        }
        available = false;
        break;
      }
      if (curStatus !== 'AVAILABLE') {
        available = false;
        break;
      }
    }

    slots.push({
      startTime,
      endTime,
      status: available ? 'AVAILABLE' : bookedAtStart ? 'BOOKED' : 'UNAVAILABLE',
      serviceId
    });
  }

  return slots;
});
