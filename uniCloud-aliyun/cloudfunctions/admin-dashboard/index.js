// 门店运营看板数据：支持按日/近7天汇总订单、理发师指标与评价趋势
const { withResponse, requireRole, getChinaDateString, autoCancelOverdueBookedOrders } = require('sb-common');

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDate(dateText) {
  const raw = String(dateText || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return getChinaDateString();
}

function buildRange(anchorDate, mode) {
  if (mode !== 'week') {
    return {
      mode: 'day',
      startDate: anchorDate,
      endDate: anchorDate,
      dates: [anchorDate]
    };
  }
  const anchorTs = new Date(`${anchorDate}T00:00:00+08:00`).getTime();
  const safeAnchorTs = Number.isFinite(anchorTs) ? anchorTs : Date.now();
  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    dates.push(getChinaDateString(safeAnchorTs - offset * DAY_MS));
  }
  return {
    mode: 'week',
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates
  };
}

async function fetchAllOrdersByDate(db, storeId, date) {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;
  const list = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await db
      .collection('orders')
      .where({ storeId, date })
      .field({ status: true, barberId: true, barberName: true })
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

async function fetchAllReviewsByStore(db, storeId) {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 100;
  const list = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await db
      .collection('reviews')
      .where({ storeId })
      .field({ createdAt: true, rating: true })
      .orderBy('createdAt', 'desc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get();
    const batch = (res && res.data) || [];
    list.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return list;
}

function calcCounters(orders) {
  const counters = {
    total: 0,
    arrived: 0,
    finished: 0,
    cancelled: 0,
    noShow: 0
  };
  (orders || []).forEach((item) => {
    const status = String((item && item.status) || '').toUpperCase();
    counters.total += 1;
    if (status === 'ARRIVED' || status === 'IN_SERVICE' || status === 'FINISHED') counters.arrived += 1;
    if (status === 'FINISHED') counters.finished += 1;
    if (status === 'CANCELLED') counters.cancelled += 1;
    if (status === 'NO_SHOW') counters.noShow += 1;
  });
  return counters;
}

function calcRates(counters) {
  const total = Number((counters && counters.total) || 0);
  if (!total) {
    return {
      finishRate: 0,
      cancelRate: 0,
      noShowRate: 0
    };
  }
  return {
    finishRate: Number((Number(counters.finished || 0) / total).toFixed(4)),
    cancelRate: Number((Number(counters.cancelled || 0) / total).toFixed(4)),
    noShowRate: Number((Number(counters.noShow || 0) / total).toFixed(4))
  };
}

function calcBarberStats(orders) {
  const map = new Map();
  (orders || []).forEach((item) => {
    const key = (item && (item.barberId || item.barberName)) || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        barberId: (item && item.barberId) || '',
        barberName: (item && item.barberName) || (item && item.barberId) || '未知',
        finished: 0,
        cancelled: 0,
        noShow: 0
      });
    }
    const target = map.get(key);
    const status = String((item && item.status) || '').toUpperCase();
    if (status === 'FINISHED') target.finished += 1;
    if (status === 'CANCELLED') target.cancelled += 1;
    if (status === 'NO_SHOW') target.noShow += 1;
  });
  return Array.from(map.values()).sort((a, b) => Number(b.finished || 0) - Number(a.finished || 0));
}

function calcReviewTrend(dates, reviews) {
  const dateSet = new Set(dates || []);
  const sumMap = {};
  const countMap = {};
  (reviews || []).forEach((item) => {
    const createdAt = Number(item && item.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return;
    const date = getChinaDateString(createdAt);
    if (!dateSet.has(date)) return;
    const overall = Number(item && item.rating && item.rating.overall);
    if (!Number.isFinite(overall) || overall <= 0) return;
    sumMap[date] = Number(sumMap[date] || 0) + overall;
    countMap[date] = Number(countMap[date] || 0) + 1;
  });
  return (dates || []).map((date) => {
    const count = Number(countMap[date] || 0);
    const sum = Number(sumMap[date] || 0);
    return {
      date,
      count,
      avg: count > 0 ? Number((sum / count).toFixed(1)) : null
    };
  });
}

// 门店运营看板
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const storeId = String((admin && admin.storeId) || '').trim();
  if (!storeId) {
    return {
      date: normalizeDate(event && event.date),
      mode: 'day',
      range: { mode: 'day', startDate: '', endDate: '', dates: [] },
      counters: { total: 0, arrived: 0, finished: 0, cancelled: 0, noShow: 0 },
      rates: { finishRate: 0, cancelRate: 0, noShowRate: 0 },
      barberStats: [],
      orderTrend: [],
      reviewTrend: []
    };
  }

  const mode = String((event && event.mode) || 'day').toLowerCase() === 'week' ? 'week' : 'day';
  const date = normalizeDate(event && event.date);
  const range = buildRange(date, mode);
  const db = uniCloud.database();

  // 看板加载前先做一次门店范围自动爽约，避免统计与实际状态不一致
  try {
    await autoCancelOverdueBookedOrders(db, { storeId, graceMin: 20, limit: 300 });
  } catch (err) {
    console.error('auto no_show overdue orders (dashboard) failed:', err);
  }

  const dayOrdersMap = {};
  const allOrders = [];
  for (const currentDate of range.dates) {
    const dayOrders = await fetchAllOrdersByDate(db, storeId, currentDate);
    dayOrdersMap[currentDate] = dayOrders;
    allOrders.push(...dayOrders);
  }

  const counters = calcCounters(allOrders);
  const rates = calcRates(counters);
  const barberStats = calcBarberStats(allOrders);
  const orderTrend = range.dates.map((currentDate) => {
    const dayOrders = dayOrdersMap[currentDate] || [];
    const dayCounters = calcCounters(dayOrders);
    return {
      date: currentDate,
      ...dayCounters,
      ...calcRates(dayCounters)
    };
  });

  const reviews = await fetchAllReviewsByStore(db, storeId);
  const reviewTrend = calcReviewTrend(range.dates, reviews);

  return {
    date,
    mode,
    range,
    counters,
    rates,
    barberStats,
    orderTrend,
    reviewTrend
  };
});
