function normalizeStatus(status) {
  const map = {
    已预约: 'BOOKED',
    已到店: 'ARRIVED',
    服务中: 'IN_SERVICE',
    已完成: 'FINISHED',
    已取消: 'CANCELLED',
    爽约: 'NO_SHOW'
  };
  return map[status] || String(status || '').toUpperCase();
}

function parseTimeToMinutes(text) {
  const m = String(text || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

function estimateDurationMin(order) {
  const start = parseTimeToMinutes(order && order.startTime);
  const end = parseTimeToMinutes(order && order.endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  return 45;
}

function remainingServiceMin(order) {
  const duration = estimateDurationMin(order);
  const inServiceAt = Number(order && order.inServiceAt);
  if (!Number.isFinite(inServiceAt) || inServiceAt <= 0) return duration;
  const elapsed = Math.floor((Date.now() - inServiceAt) / (60 * 1000));
  return Math.max(duration - elapsed, 5);
}

function queueSort(a, b) {
  const sa = normalizeStatus(a && a.status);
  const sb = normalizeStatus(b && b.status);
  if (sa !== sb) return sa === 'IN_SERVICE' ? -1 : 1;
  const aa = Number(a && a.arrivedAt);
  const bb = Number(b && b.arrivedAt);
  if (Number.isFinite(aa) && Number.isFinite(bb) && aa !== bb) return aa - bb;
  return String((a && a.startTime) || '').localeCompare(String((b && b.startTime) || ''));
}

async function buildQueueHintMap(db, orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) return {};
  const targetOrderIdSet = new Set(list.map((item) => item && item._id).filter((id) => !!id));
  const groupMap = new Map();
  list.forEach((item) => {
    const barberId = String(item && item.barberId || '');
    const date = String(item && item.date || '');
    if (!barberId || !date) return;
    const key = `${barberId}@@${date}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { barberId, date });
    }
  });
  if (groupMap.size === 0) return {};

  const queueRows = [];
  const groups = Array.from(groupMap.values());
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const res = await db
      .collection('orders')
      .where({
        barberId: group.barberId,
        date: group.date,
        status: db.command.in(['ARRIVED', 'IN_SERVICE', '已到店', '服务中'])
      })
      .field({
        _id: true,
        status: true,
        barberId: true,
        date: true,
        startTime: true,
        endTime: true,
        arrivedAt: true,
        inServiceAt: true
      })
      .get();
    const rows = (res && res.data) || [];
    queueRows.push(...rows);
  }

  const queueByGroup = new Map();
  queueRows.forEach((item) => {
    const barberId = String(item && item.barberId || '');
    const date = String(item && item.date || '');
    if (!barberId || !date) return;
    const key = `${barberId}@@${date}`;
    if (!queueByGroup.has(key)) queueByGroup.set(key, []);
    queueByGroup.get(key).push(item);
  });

  const hintMap = {};
  list.forEach((item) => {
    const orderId = item && item._id;
    const status = normalizeStatus(item && item.status);
    const barberId = String(item && item.barberId || '');
    const date = String(item && item.date || '');
    if (!orderId || !barberId || !date) return;
    if (status !== 'ARRIVED') {
      hintMap[orderId] = { queueAheadCount: 0, queueWaitMin: 0 };
      return;
    }
    const key = `${barberId}@@${date}`;
    const queue = (queueByGroup.get(key) || []).slice().sort(queueSort);
    const idx = queue.findIndex((row) => row && row._id === orderId);
    if (idx <= 0) {
      hintMap[orderId] = { queueAheadCount: 0, queueWaitMin: 0 };
      return;
    }
    const ahead = queue.slice(0, idx);
    const waitMin = ahead.reduce((sum, row) => {
      const s = normalizeStatus(row && row.status);
      if (s === 'IN_SERVICE') return sum + remainingServiceMin(row);
      return sum + estimateDurationMin(row);
    }, 0);
    hintMap[orderId] = { queueAheadCount: idx, queueWaitMin: waitMin };
  });

  // 为未命中目标订单兜底
  targetOrderIdSet.forEach((orderId) => {
    if (!hintMap[orderId]) hintMap[orderId] = { queueAheadCount: 0, queueWaitMin: 0 };
  });
  return hintMap;
}

function attachQueueHints(list, hintMap) {
  const rows = Array.isArray(list) ? list : [];
  return rows.map((item) => {
    const hint = (hintMap && hintMap[item && item._id]) || { queueAheadCount: 0, queueWaitMin: 0 };
    return {
      ...item,
      queueAheadCount: Number(hint.queueAheadCount || 0),
      queueWaitMin: Number(hint.queueWaitMin || 0)
    };
  });
}

module.exports = {
  buildQueueHintMap,
  attachQueueHints
};

