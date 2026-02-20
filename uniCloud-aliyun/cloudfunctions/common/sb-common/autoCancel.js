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

function parseOrderStartMs(order) {
  if (!order || !order.date) return 0;
  const startTime = order.startTime || order.endTime || '';
  if (!startTime) return 0;
  return new Date(`${order.date}T${startTime}:00+08:00`).getTime();
}

async function hasArrivalReminderSent(db, userId, orderId, title, content) {
  if (!userId || !orderId || !title) return false;
  const where = {
    userId,
    type: 'arrival_reminder',
    relatedId: orderId,
    title
  };
  if (content) where.content = content;
  const res = await db
    .collection('notifications')
    .where(where)
    .limit(1)
    .get();
  return !!(res && res.data && res.data.length > 0);
}

async function sendUpcomingReminderForUser(order, minutes) {
  const orderId = order._id || '';
  const userId = order.userId || '';
  if (!orderId || !userId) return false;

  const date = order.date || '';
  const startTime = order.startTime || '';
  const whenText = `${date} ${startTime}`.trim();
  const title = minutes === 60
    ? '到店提醒（1小时）'
    : minutes === 10
      ? '到店提醒（10分钟）'
      : '到店提醒（5分钟）';
  const content = minutes === 60
    ? `您预约的 ${whenText} 将在1小时后开始，请提前安排出行。`
    : minutes === 10
      ? `您预约的 ${whenText} 将在10分钟后开始，请提前到店。`
      : `您预约的 ${whenText} 将在5分钟后开始，当前已不可改期。`;

  await uniCloud.callFunction({
    name: 'notifications-create',
    data: {
      userId,
      type: 'arrival_reminder',
      title,
      content,
      relatedId: orderId
    }
  });
  return true;
}

async function sendUpcomingReminders(db, options = {}) {
  const _ = db.command;
  const now = Date.now();
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
  const today = toShanghaiDate(now);
  const tomorrow = toShanghaiDate(now + 24 * 60 * 60 * 1000);
  const remindOrderIds = [];
  const remindedUsers = [];

  const where = {
    status: _.in(['BOOKED', '已预约']),
    date: _.in([today, tomorrow])
  };
  if (options.orderId) where._id = options.orderId;
  if (options.storeId) where.storeId = options.storeId;
  if (options.barberId) where.barberId = options.barberId;
  if (options.userId) where.userId = options.userId;
  if (options.date) where.date = options.date;

  const res = await db
    .collection('orders')
    .where(where)
    .field({
      _id: true,
      userId: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .orderBy('startTime', 'asc')
    .limit(limit)
    .get();

  const list = res.data || [];
  for (let i = 0; i < list.length; i += 1) {
    const order = list[i];
    const startMs = parseOrderStartMs(order);
    if (!startMs) continue;
    const diffMin = Math.floor((startMs - now) / (60 * 1000));
    if (diffMin < 0 || diffMin > 60) continue;

    let targetMinute = 0;
    if (diffMin <= 5) {
      targetMinute = 5;
    } else if (diffMin <= 10) {
      targetMinute = 10;
    } else if (diffMin <= 60) {
      targetMinute = 60;
    }
    if (!targetMinute) continue;

    const title = targetMinute === 60
      ? '到店提醒（1小时）'
      : targetMinute === 10
        ? '到店提醒（10分钟）'
        : '到店提醒（5分钟）';
    const whenText = `${order.date || ''} ${order.startTime || ''}`.trim();
    const content = targetMinute === 60
      ? `您预约的 ${whenText} 将在1小时后开始，请提前安排出行。`
      : targetMinute === 10
        ? `您预约的 ${whenText} 将在10分钟后开始，请提前到店。`
        : `您预约的 ${whenText} 将在5分钟后开始，当前已不可改期。`;
    const sent = await hasArrivalReminderSent(db, order.userId, order._id, title, content);
    if (sent) continue;

    try {
      const ok = await sendUpcomingReminderForUser(order, targetMinute);
      if (ok) {
        remindOrderIds.push(order._id);
        remindedUsers.push(order.userId || '');
      }
    } catch (err) {
      console.error('send upcoming reminder failed:', err);
    }
  }

  return {
    scanned: list.length,
    reminded: remindOrderIds.length,
    remindOrderIds,
    remindedUsers
  };
}

async function hasReviewReminderSent(db, userId, orderId) {
  if (!userId || !orderId) return false;
  const res = await db
    .collection('notifications')
    .where({
      userId,
      type: 'service_finish',
      title: '服务完成，请评价',
      relatedId: orderId
    })
    .limit(1)
    .get();
  return !!(res && res.data && res.data.length > 0);
}

async function sendReviewReminders(db, options = {}) {
  const _ = db.command;
  const now = Date.now();
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 300);
  const today = toShanghaiDate(now);

  const where = {
    status: _.in(['FINISHED', '已完成'])
  };
  if (options.orderId) where._id = options.orderId;
  if (options.storeId) where.storeId = options.storeId;
  if (options.barberId) where.barberId = options.barberId;
  if (options.userId) where.userId = options.userId;
  if (options.date) {
    where.date = options.date;
  } else {
    where.date = _.lte(today);
  }

  const res = await db
    .collection('orders')
    .where(where)
    .field({
      _id: true,
      userId: true,
      date: true,
      startTime: true,
      finishedAt: true,
      updatedAt: true
    })
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();

  const list = res.data || [];
  const remindOrderIds = [];

  for (let i = 0; i < list.length; i += 1) {
    const order = list[i];
    const orderId = order._id || '';
    const userId = order.userId || '';
    if (!orderId || !userId) continue;
    const doneAt = Number(order.finishedAt || order.updatedAt || 0);
    if (!doneAt || now - doneAt < 30 * 60 * 1000) continue;

    const reviewRes = await db.collection('reviews').where({ orderId }).limit(1).get();
    if (reviewRes && reviewRes.data && reviewRes.data.length > 0) continue;

    const notified = await hasReviewReminderSent(db, userId, orderId);
    if (notified) continue;

    const whenText = `${order.date || ''} ${order.startTime || ''}`.trim();
    try {
      await uniCloud.callFunction({
        name: 'notifications-create',
        data: {
          userId,
          type: 'service_finish',
          title: '服务完成，请评价',
          content: `您在 ${whenText} 的服务已完成，欢迎为本次服务打分与评价。`,
          relatedId: orderId
        }
      });
      remindOrderIds.push(orderId);
    } catch (err) {
      console.error('send review reminder failed:', err);
    }
  }

  return {
    scanned: list.length,
    reminded: remindOrderIds.length,
    remindOrderIds
  };
}

async function sendAutoNoShowNotifications(db, order, graceMin) {
  const orderId = order._id || '';
  const date = order.date || '';
  const startTime = order.startTime || '';
  const endTime = order.endTime || '';
  const timeRange = endTime ? `${date} ${startTime}-${endTime}` : `${date} ${startTime}`;
  const timeoutText = `${graceMin}分钟`;

  if (order.userId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: order.userId,
        type: 'no_show',
        title: '订单已标记爽约',
        content: `您的预约 ${timeRange} 超过开始时间 ${timeoutText} 未到店，系统已自动标记为爽约。`,
        relatedId: orderId
      }
    });
  }

  if (order.barberId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: order.barberId,
        type: 'no_show',
        title: '订单已标记爽约',
        content: `预约 ${timeRange} 已超时 ${timeoutText}，系统自动标记为爽约。`,
        relatedId: orderId
      }
    });
  }

  if (!order.storeId) return;
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
        type: 'no_show',
        title: '订单已标记爽约',
        content: `门店预约 ${timeRange} 已超时 ${timeoutText}，系统自动标记为爽约。`,
        relatedId: orderId
      }
    });
  }
}

// 兼容历史调用名：保留函数名不变，语义改为“自动标记爽约”
async function autoCancelOverdueBookedOrders(db, options = {}) {
  const _ = db.command;
  const now = Date.now();
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 300);
  const graceMin = Math.max(Number(options.graceMin || 20), 0);

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
  const noShowOrderIds = [];

  for (let i = 0; i < list.length; i += 1) {
    const order = list[i];
    if (normalizeStatus(order.status) !== 'BOOKED') continue;

    const startMs = parseOrderStartMs(order);
    if (!startMs) continue;
    if (now < startMs + graceMin * 60 * 1000) continue;

    const updateRes = await db
      .collection('orders')
      .where({ _id: order._id, status: _.in(['BOOKED', '已预约']) })
      .update({
        status: 'NO_SHOW',
        noShowReason: `auto_timeout_${graceMin}min`,
        noShowAt: now,
        updatedAt: now
      });
    if (!updateRes || updateRes.updated <= 0) continue;

    noShowOrderIds.push(order._id);

    await db.collection('time_slots').where({ orderId: order._id }).update({
      status: 'AVAILABLE',
      orderId: '',
      updatedAt: now
    });

    await logOrderEvent(db, {
      orderId: order._id,
      fromStatus: 'BOOKED',
      toStatus: 'NO_SHOW',
      opUserId: 'system',
      role: 'system',
      ts: now,
      remark: 'auto_no_show_timeout'
    });

    await logAudit(db, {
      actorId: 'system',
      role: 'system',
      action: 'auto_no_show',
      orderId: order._id,
      time: now,
      result: 'success',
      message: `auto timeout no_show (${graceMin}min)`
    });

    try {
      await sendAutoNoShowNotifications(db, order, graceMin);
    } catch (err) {
      console.error('auto no_show notify failed:', err);
    }
  }

  let reminderStats = { scanned: 0, reminded: 0, remindOrderIds: [] };
  try {
    reminderStats = await sendUpcomingReminders(db, options);
  } catch (err) {
    console.error('auto upcoming reminders failed:', err);
  }

  let reviewReminderStats = { scanned: 0, reminded: 0, remindOrderIds: [] };
  try {
    reviewReminderStats = await sendReviewReminders(db, options);
  } catch (err) {
    console.error('auto review reminders failed:', err);
  }

  return {
    scanned: list.length,
    noShowed: noShowOrderIds.length,
    noShowOrderIds,
    reminderScanned: reminderStats.scanned || 0,
    reminded: reminderStats.reminded || 0,
    remindOrderIds: reminderStats.remindOrderIds || [],
    reviewReminderScanned: reviewReminderStats.scanned || 0,
    reviewReminded: reviewReminderStats.reminded || 0,
    reviewRemindOrderIds: reviewReminderStats.remindOrderIds || [],
    // 兼容旧统计字段
    cancelled: noShowOrderIds.length,
    cancelledOrderIds: noShowOrderIds
  };
}

module.exports = {
  autoCancelOverdueBookedOrders
};
