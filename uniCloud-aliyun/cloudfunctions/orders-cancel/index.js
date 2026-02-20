const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

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

function toChinaTimestamp(date, time) {
  if (!date || !time) return 0;
  const ms = new Date(`${date}T${time}:00+08:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function inCancelWindow(order, now, cancelWindowMin) {
  const startMs = toChinaTimestamp(order.date, order.startTime);
  if (!startMs) return true;
  return now <= startMs + cancelWindowMin * 60 * 1000;
}

async function notifyCancelStakeholders(db, payload = {}) {
  const {
    orderId = '',
    storeId = '',
    barberId = '',
    userId = '',
    date = '',
    startTime = '',
    reason = '',
    operatorId = '',
    operatorRole = 'user'
  } = payload;

  const reasonText = reason ? `，原因：${reason}` : '';
  const timeText = `${date} ${startTime}`.trim();

  // 通知顾客
  if (userId) {
    const content = operatorRole === 'admin'
      ? `门店已取消您 ${timeText} 的预约${reasonText}。`
      : `您已取消 ${timeText} 的预约${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'cancel',
        title: '订单已取消',
        content,
        relatedId: orderId
      }
    });
  }

  // 通知理发师
  if (barberId && barberId !== operatorId) {
    const content = operatorRole === 'admin'
      ? `门店已取消 ${timeText} 的预约${reasonText}。`
      : `顾客已取消 ${timeText} 的预约${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: barberId,
        type: 'cancel',
        title: '订单取消提醒',
        content,
        relatedId: orderId
      }
    });
  }

  // 通知门店管理员
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

    const content = operatorRole === 'admin'
      ? `门店预约 ${timeText} 已取消${reasonText}。`
      : `门店预约 ${timeText} 已被顾客取消${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: adminId,
        type: 'cancel',
        title: '订单取消提醒',
        content,
        relatedId: orderId
      }
    });
  }
}

// 取消预约：仅 BOOKED 可取消；顾客和门店都可以取消
// 时间窗口：开始后 5 分钟内可取消（含开始前）
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const actor = await requireRole(['user', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  const reason = (event && event.reason) || '';
  const cancelWindowMin = Math.max(Number((event && event.cancelWindowMin) || 5), 0);

  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const actorId = actor._id || actor.uid || actor.userId;
  const actorRole = actor.role || 'user';
  const db = uniCloud.database();
  const _ = db.command;

  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true,
      status: true,
      barberId: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  if (actorRole === 'user' && order.userId !== actorId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (actorRole === 'admin' && actor.storeId && order.storeId !== actor.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const normalizedStatus = normalizeStatus(order.status);

  // 幂等：已取消直接返回
  if (normalizedStatus === 'CANCELLED') {
    return {
      order: {
        ...order,
        status: 'CANCELLED'
      }
    };
  }

  if (normalizedStatus !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const now = Date.now();
  if (!inCancelWindow(order, now, cancelWindowMin)) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'cancel_window_expired');
  }

  try {
    const updateRes = await db
      .collection('orders')
      .where({ _id: orderId, status: _.in(['BOOKED', '已预约']) })
      .update({
        status: 'CANCELLED',
        cancelReason: reason || '',
        updatedAt: now
      });

    if (!updateRes || updateRes.updated <= 0) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
    }

    await db
      .collection('time_slots')
      .where({ barberId: order.barberId, date: order.date, orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: now
      });

    await logOrderEvent(db, {
      orderId,
      fromStatus: 'BOOKED',
      toStatus: 'CANCELLED',
      opUserId: actorId,
      role: actorRole,
      ts: now,
      remark: reason || `${actorRole}_cancel`
    });

    await logAudit(db, {
      actorId,
      role: actorRole,
      action: 'cancel',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    await logAudit(db, {
      actorId,
      role: actorRole,
      action: 'cancel',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'cancel_failed',
      requestId
    });
    throw err;
  }

  try {
    await notifyCancelStakeholders(db, {
      orderId,
      storeId: order.storeId || '',
      barberId: order.barberId || '',
      userId: order.userId || '',
      date: order.date || '',
      startTime: order.startTime || '',
      reason: reason || '',
      operatorId: actorId,
      operatorRole: actorRole
    });
  } catch (err) {
    console.error('notify cancel stakeholders failed:', err);
  }

  return {
    order: {
      ...order,
      status: 'CANCELLED',
      cancelReason: reason || '',
      updatedAt: now
    }
  };
});
