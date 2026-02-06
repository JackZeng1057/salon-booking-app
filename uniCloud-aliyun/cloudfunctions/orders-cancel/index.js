const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

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
