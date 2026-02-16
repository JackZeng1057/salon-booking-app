const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

async function notifyCancelStakeholders(db, payload = {}) {
  const {
    orderId = '',
    storeId = '',
    barberId = '',
    userId = '',
    date = '',
    startTime = '',
    reason = '',
    operatorId = ''
  } = payload;

  const reasonText = reason ? `，原因：${reason}` : '';

  // 通知下单用户本人
  if (userId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'cancel',
        title: '订单已取消',
        content: `您已取消 ${date} ${startTime} 的预约${reasonText}。`,
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
        type: 'cancel',
        title: '订单取消提醒',
        content: `顾客已取消 ${date} ${startTime} 的预约${reasonText}。`,
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
        type: 'cancel',
        title: '订单取消提醒',
        content: `门店预约 ${date} ${startTime} 已被顾客取消${reasonText}。`,
        relatedId: orderId
      }
    });
  }
}

// 取消预约：仅 BOOKED 可取消，取消后释放关联 slots
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 user 可取消
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const reason = (event && event.reason) || '';

  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  // 仅取取消校验所需字段，减少读取量
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true,
      status: true,
      barberId: true,
      date: true,
      startTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 只能取消自己的订单
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 幂等：已取消直接返回
  if (order.status === 'CANCELLED') {
    return { order };
  }

  // 状态校验：仅 BOOKED 可取消
  if (order.status !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const now = Date.now();
  try {
    // 更新订单状态为 CANCELLED
    await db.collection('orders').doc(orderId).update({
      status: 'CANCELLED',
      cancelReason: reason || '',
      updatedAt: now
    });

    // 释放 slot（置回 AVAILABLE）
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
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      opUserId: userId,
      role: 'user',
      ts: now,
      remark: reason || 'cancel'
    });

    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'cancel',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'cancel',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'cancel_failed',
      requestId
    });
    throw err;
  }

  // 通知理发师与门店管理员（失败不影响主流程）
  try {
    await notifyCancelStakeholders(db, {
      orderId,
      storeId: order.storeId || '',
      barberId: order.barberId || '',
      userId,
      date: order.date || '',
      startTime: order.startTime || '',
      reason: reason || '',
      operatorId: userId
    });
  } catch (err) {
    console.error('notify cancel stakeholders failed:', err);
  }

  // 直接拼装返回，避免二次读取
  return {
    order: {
      ...order,
      status: 'CANCELLED',
      cancelReason: reason || '',
      updatedAt: now
    }
  };
});
