// 门店运营看板数据：按日期汇总订单统计
const { withResponse, requireRole } = require('sb-common');

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 门店运营看板
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const date = (event && event.date) || toDateString(new Date());

  const db = uniCloud.database();
  const storeId = admin.storeId || '';

  const res = await db
    .collection('orders')
    .where({ storeId, date })
    .field({ status: true, barberId: true, barberName: true })
    .get();

  const orders = res.data || [];

  const counters = {
    total: 0,
    arrived: 0,
    finished: 0,
    cancelled: 0,
    noShow: 0
  };

  const barberStats = {};

  orders.forEach((o) => {
    const status = o.status || '';
    counters.total += ['BOOKED', 'ARRIVED', 'IN_SERVICE', 'FINISHED', 'NO_SHOW'].includes(status) ? 1 : 0;
    if (['ARRIVED', 'IN_SERVICE', 'FINISHED'].includes(status)) counters.arrived += 1;
    if (status === 'FINISHED') counters.finished += 1;
    if (status === 'CANCELLED') counters.cancelled += 1;
    if (status === 'NO_SHOW') counters.noShow += 1;

    const key = o.barberId || o.barberName || '未知';
    if (!barberStats[key]) {
      barberStats[key] = {
        barberId: o.barberId || '',
        barberName: o.barberName || o.barberId || '未知',
        finished: 0,
        cancelled: 0,
        noShow: 0
      };
    }
    if (status === 'FINISHED') barberStats[key].finished += 1;
    if (status === 'CANCELLED') barberStats[key].cancelled += 1;
    if (status === 'NO_SHOW') barberStats[key].noShow += 1;
  });

  return {
    date,
    counters,
    barberStats: Object.values(barberStats)
  };
});
