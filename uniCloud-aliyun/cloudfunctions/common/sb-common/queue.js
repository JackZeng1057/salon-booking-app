/**
 * 排队提示计算工具
 * 用于给 ARRIVED 订单补充：
 * - queueAheadCount: 前方人数
 * - queueWaitMin: 预计等待分钟数
 */

// 状态归一化：兼容中文状态与英文状态码
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

// HH:mm -> 分钟数
function parseTimeToMinutes(text) {
  const m = String(text || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

// 估算订单服务时长（优先 end-start，兜底 45 分钟）
function estimateDurationMin(order) {
  const start = parseTimeToMinutes(order && order.startTime);
  const end = parseTimeToMinutes(order && order.endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  return 45;
}

// 服务中订单的预计剩余时长（至少 5 分钟）
function remainingServiceMin(order) {
  const duration = estimateDurationMin(order);
  const inServiceAt = Number(order && order.inServiceAt);
  if (!Number.isFinite(inServiceAt) || inServiceAt <= 0) return duration;
  const elapsed = Math.floor((Date.now() - inServiceAt) / (60 * 1000));
  return Math.max(duration - elapsed, 5);
}

// 排队排序：服务中优先，再按到店时间/预约时间
function queueSort(a, b) {
  const sa = normalizeStatus(a && a.status);
  const sb = normalizeStatus(b && b.status);
  if (sa !== sb) return sa === 'IN_SERVICE' ? -1 : 1;
  const aa = Number(a && a.arrivedAt);
  const bb = Number(b && b.arrivedAt);
  if (Number.isFinite(aa) && Number.isFinite(bb) && aa !== bb) return aa - bb;
  return String((a && a.startTime) || '').localeCompare(String((b && b.startTime) || ''));
}

// 构建排队提示映射
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

  // 查询同理发师同日期的排队池订单（已到店 + 服务中）
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

  // 构建 groupKey -> queueRows 的索引
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
    // 非已到店状态不参与排队，直接返回 0
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
    // 前方排队时长：服务中按剩余时长计算，其它按估算总时长
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

// 将排队提示附加到订单列表
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
