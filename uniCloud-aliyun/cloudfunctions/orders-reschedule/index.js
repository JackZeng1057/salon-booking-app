const {
  withResponse,
  ApiError,
  ERROR_CODES,
  requireRole,
  logAudit,
  logOrderEvent,
  isValidBookingDate,
  isValidBookingTime,
  timeToMinutes,
  minutesToTime,
  isAlignedToSlotStep,
  buildRequiredSlotStartTimes,
  ensureSlotTimesWithinSchedule,
  ensureSlotDocsExist,
  lockSlotTimesForOrder
} = require('sb-common');

async function notifyRescheduleStakeholders(db, payload = {}) {
  const {
    orderId = '',
    storeId = '',
    barberId = '',
    userId = '',
    oldDate = '',
    oldStartTime = '',
    newDate = '',
    newStartTime = '',
    operatorId = ''
  } = payload;

  const oldText = `${oldDate} ${oldStartTime}`.trim();
  const newText = `${newDate} ${newStartTime}`.trim();

  // 通知下单用户本人
  if (userId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'reschedule',
        title: '订单改期成功',
        content: `您已将预约从 ${oldText} 改期到 ${newText}。`,
        relatedId: orderId
      }
    });
  }

  // 通知理发师
  if (barberId && barberId !== operatorId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: barberId,
        type: 'reschedule',
        title: '订单改期提醒',
        content: `顾客将预约从 ${oldText} 改期到 ${newText}。`,
        relatedId: orderId
      }
    });
  }

  // 通知门店管理员（同店多个管理员）
  if (!storeId) return;
  const adminRes = await db
    .collection('users')
    .where({ role: 'admin', storeId })
    .field({ _id: true })
    .get();
  const admins = adminRes.data || [];
  for (let i = 0; i < admins.length; i += 1) {
    const adminId = (admins[i] && admins[i]._id) || '';
    if (!adminId || adminId === operatorId) continue;
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: adminId,
        type: 'reschedule',
        title: '订单改期提醒',
        content: `门店预约已改期：${oldText} -> ${newText}。`,
        relatedId: orderId
      }
    });
  }
}

function mapRescheduleFailMessage(errorCode) {
  const map = {
    reschedule_window_expired: '距离开始不足5分钟，当前不可改期。',
    status_not_allowed: '当前订单状态不允许改期。',
    booking_window_closed: '目标时段距离开始不足5分钟，已停止预约。',
    time_expired: '目标时段已过期，请重新选择。',
    outside_schedule: '目标时段不在排班内，请更换时间。',
    slot_conflict: '目标时段已被占用，请重新选择。'
  };
  return map[errorCode] || '改期未成功，请稍后重试。';
}

async function hasRecentRescheduleFailNotice(db, userId, orderId, content, withinMin = 3) {
  if (!userId || !orderId || !content) return false;
  const now = Date.now();
  const res = await db
    .collection('notifications')
    .where({
      userId,
      type: 'reschedule',
      title: '订单改期失败',
      relatedId: orderId,
      content,
      createdAt: db.command.gte(now - withinMin * 60 * 1000)
    })
    .limit(1)
    .get();
  return !!(res && res.data && res.data.length > 0);
}

async function notifyRescheduleFailure(db, payload = {}) {
  const {
    userId = '',
    orderId = '',
    oldDate = '',
    oldStartTime = '',
    errorCode = ''
  } = payload;
  if (!userId || !orderId) return;

  const oldText = `${oldDate} ${oldStartTime}`.trim();
  const reason = mapRescheduleFailMessage(errorCode);
  const content = `您发起的 ${oldText} 改期失败。${reason}`;
  const duplicated = await hasRecentRescheduleFailNotice(db, userId, orderId, content);
  if (duplicated) return;

  await uniCloud.callFunction({
    name: 'notifications-create',
    data: {
      userId,
      type: 'reschedule',
      title: '订单改期失败',
      content,
      relatedId: orderId
    }
  });
}

// 订单改期：
// 1) 先占用新时段（多段 5 分钟 slots）
// 2) 更新订单时间与记录改期来源
// 3) 最后释放旧时段，确保改期成功才释放

// 改期预约（占新优先）
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 user 可改期
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const newDate = (event && event.newDate) || '';
  const newStartTime = (event && event.newStartTime) || '';

  if (!orderId || !newDate || !newStartTime) {
    throw new ApiError(400, 'orderId, newDate, newStartTime required');
  }
  if (!isValidBookingDate(newDate)) {
    throw new ApiError(400, 'invalid date format');
  }
  if (!isValidBookingTime(newStartTime)) {
    throw new ApiError(400, 'invalid time format');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  // 仅取改期校验所需字段，减少读取量
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      status: true,
      barberId: true,
      storeId: true,
      serviceId: true,
      date: true,
      startTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 只能改期自己的订单
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 状态校验：仅 BOOKED 可改期
  if (order.status !== 'BOOKED') {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'status_not_allowed'
      });
    } catch (err) {
      console.error('notify reschedule failed(status) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  // 改期窗口：开始前 5 分钟截止
  const orderStartMs = new Date(`${order.date}T${order.startTime}:00+08:00`).getTime();
  if (orderStartMs && Date.now() >= orderStartMs - 5 * 60 * 1000) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'reschedule_window_expired'
      });
    } catch (err) {
      console.error('notify reschedule failed(window) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'reschedule_window_expired');
  }

  // 若改期到同一日期与时段，直接返回，避免无效写
  if (order.date === newDate && order.startTime === newStartTime) {
    return { order };
  }

  // 计算新的 endTime
  // 仅取时长字段用于计算 endTime
  const serviceRes = await db
    .collection('services')
    .doc(order.serviceId)
    .field({ duration: true, durationMin: true })
    .get();
  const service = serviceRes.data && serviceRes.data[0];
  const durationMin = Number((service && (service.duration || service.durationMin)) || 30);
  const startMin = timeToMinutes(newStartTime);
  if (Number.isNaN(startMin) || !isAlignedToSlotStep(startMin)) {
    throw new ApiError(400, 'invalid startTime');
  }
  // endTime 仅用于展示与订单快照
  const newEndTime = minutesToTime(startMin + durationMin);

  const startMs = new Date(`${newDate}T${newStartTime}:00+08:00`).getTime();
  if (startMs && startMs <= Date.now() + 5 * 60 * 1000) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'booking_window_closed'
      });
    } catch (err) {
      console.error('notify reschedule failed(expired) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'booking_window_closed');
  }

  const _ = db.command;
  const newSlotTimes = buildRequiredSlotStartTimes(newStartTime, durationMin);
  try {
    await ensureSlotTimesWithinSchedule(db, order.barberId, newDate, newSlotTimes);
    await ensureSlotDocsExist(db, {
      storeId: order.storeId || '',
      barberId: order.barberId,
      date: newDate,
      slotTimes: newSlotTimes
    });
    await lockSlotTimesForOrder(db, {
      barberId: order.barberId,
      date: newDate,
      slotTimes: newSlotTimes,
      orderId
    });
  } catch (err) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: err && err.message ? err.message : 'reschedule_failed'
      });
    } catch (notifyErr) {
      console.error('notify reschedule failed(slot) error:', notifyErr);
    }
    throw err;
  }

  const rescheduleFrom = `${order.date} ${order.startTime}`;

  const now = Date.now();
  try {
    // 更新订单时间
    await db.collection('orders').doc(orderId).update({
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      rescheduleFrom,
      updatedAt: now
    });

    const oldSlotTimes = buildRequiredSlotStartTimes(order.startTime, durationMin);
    // 释放旧 slot
    await db
      .collection('time_slots')
      .where({ barberId: order.barberId, date: order.date, startTime: _.in(oldSlotTimes), orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: now
      });

    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      opUserId: userId,
      role: 'user',
      ts: now,
      remark: `reschedule:${rescheduleFrom} -> ${newDate} ${newStartTime}`
    });

    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'reschedule',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: err && err.message ? err.message : 'reschedule_failed'
      });
    } catch (notifyErr) {
      console.error('notify reschedule failed(update) error:', notifyErr);
    }
    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'reschedule',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'reschedule_failed',
      requestId
    });
    throw err;
  }

  // 通知理发师与门店管理员（失败不影响主流程）
  try {
    await notifyRescheduleStakeholders(db, {
      orderId,
      storeId: order.storeId || '',
      barberId: order.barberId || '',
      userId,
      oldDate: order.date || '',
      oldStartTime: order.startTime || '',
      newDate,
      newStartTime,
      operatorId: userId
    });
  } catch (err) {
    console.error('notify reschedule stakeholders failed:', err);
  }

  // 直接拼装返回，避免二次读取
  return {
    order: {
      ...order,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      rescheduleFrom,
      updatedAt: now
    }
  };
});
