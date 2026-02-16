const { logAudit, logOrderEvent } = require('./audit');

function normalizeStatus(status) {
  const map = {
    已预约: 'BOOKED',
    已到店: 'ARRIVED',
    服务中: 'IN_SERVICE',
    已完成: 'FINISHED',
    已取消: 'CANCELLED',
    爽约: 'NO_SHOW'
  };
  return map[status] || status;
}

function toShanghaiDate(ts) {
  const d = new Date(ts + 8 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseOrderDueMs(order, fallbackMin = 15) {
  if (!order || !order.date) return 0;
  const endTime = order.endTime || order.startTime || '';
  if (!endTime) return 0;
  const endMs = new Date(`${order.date}T${endTime}:00+08:00`).getTime();
  if (order.endTime || !order.startTime) return endMs;
  return endMs + fallbackMin * 60 * 1000;
}

async function sendAutoCancelNotifications(db, order) {
  const orderId = order._id || '';
  const date = order.date || '';
  const startTime = order.startTime || '';
  const endTime = order.endTime || '';
  const timeRange = endTime ? `${date} ${startTime}-${endTime}` : `${date} ${startTime}`;

  // 通知顾客
  if (order.userId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: order.userId,
        type: 'cancel',
        title: '订单自动取消',
        content: `由于预约超时未处理，系统已自动取消您在 ${timeRange} 的预约。`,
        relatedId: orderId
      }
    });
  }

  // 通知理发师
  if (order.barberId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: order.barberId,
        type: 'cancel',
        title: '订单自动取消',
        content: `预约 ${timeRange} 已因超时由系统自动取消。`,
        relatedId: orderId
      }
    });
  }

  // 通知门店管理员
  if (order.storeId) {
    const adminRes = await db
      .collection('users')
      .where({ role: 'admin', storeId: order.storeId })
      .field({ _id: true })
      .get();
    const admins = adminRes.data || [];
    for (let i = 0; i < admins.length; i += 1) {
      const adminId = (admins[i] && admins[i]._id) || '';
      if (!adminId) continue;
      await uniCloud.callFunction({
        name: 'notifications-create',
        data: {
          userId: adminId,
          type: 'cancel',
          title: '订单自动取消',
          content: `门店预约 ${timeRange} 已因超时由系统自动取消。`,
          relatedId: orderId
        }
      });
    }
  }

}

async function autoCancelOverdueBookedOrders(db, options = {}) {
  const _ = db.command;
  const now = Date.now();
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 300);
  const graceMin = Math.max(Number(options.graceMin || 15), 0);

  const where = {
    status: _.in(['BOOKED', '已预约'])
  };
  if (options.orderId) where._id = options.orderId;
  if (options.storeId) where.storeId = options.storeId;
  if (options.barberId) where.barberId = options.barberId;
  if (options.userId) where.userId = options.userId;
  if (options.date) {
    where.date = options.date;
  } else {
    where.date = _.lte(toShanghaiDate(now));
  }

  const res = await db
    .collection('orders')
    .where(where)
    .field({
      _id: true,
      status: true,
      userId: true,
      storeId: true,
      barberId: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .orderBy('date', 'asc')
    .orderBy('startTime', 'asc')
    .limit(limit)
    .get();

  const list = res.data || [];
  const cancelledOrderIds = [];

  for (let i = 0; i < list.length; i += 1) {
    const order = list[i];
    if (normalizeStatus(order.status) !== 'BOOKED') continue;
    const dueMs = parseOrderDueMs(order);
    if (!dueMs) continue;
    if (now < dueMs + graceMin * 60 * 1000) continue;

    const updateRes = await db
      .collection('orders')
      .where({ _id: order._id, status: _.in(['BOOKED', '已预约']) })
      .update({
        status: 'CANCELLED',
        cancelReason: 'auto_timeout',
        autoCancelledAt: now,
        updatedAt: now
      });
    if (!updateRes || updateRes.updated <= 0) continue;

    cancelledOrderIds.push(order._id);

    await db.collection('time_slots').where({ orderId: order._id }).update({
      status: 'AVAILABLE',
      orderId: '',
      updatedAt: now
    });

    await logOrderEvent(db, {
      orderId: order._id,
      fromStatus: 'BOOKED',
      toStatus: 'CANCELLED',
      opUserId: 'system',
      role: 'system',
      ts: now,
      remark: 'auto_cancel_timeout'
    });

    await logAudit(db, {
      actorId: 'system',
      role: 'system',
      action: 'auto_cancel',
      orderId: order._id,
      time: now,
      result: 'success',
      message: 'auto timeout cancel'
    });

    try {
      await sendAutoCancelNotifications(db, order);
    } catch (err) {
      console.error('auto cancel notify failed:', err);
    }
  }

  return {
    scanned: list.length,
    cancelled: cancelledOrderIds.length,
    cancelledOrderIds
  };
}

module.exports = {
  autoCancelOverdueBookedOrders
};
