const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 完成服务（IN_SERVICE -> FINISHED）：记录完成时间与日志
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const operator = await requireRole(['barber', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      status: true,
      barberId: true,
      storeId: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  const role = operator.role || operator.type || '';
  if (role === 'barber' && order.barberId !== (operator._id || operator.uid || operator.userId)) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (role === 'admin' && operator.storeId && order.storeId !== operator.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 幂等：已完成直接返回
  if (order.status === 'FINISHED') {
    return { order };
  }

  if (order.status !== 'IN_SERVICE') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const now = Date.now();
  const operatorId = operator._id || operator.uid || operator.userId;
  try {
    await db.collection('orders').doc(orderId).update({
      status: 'FINISHED',
      finishedAt: now,
      updatedAt: now
    });

    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: 'FINISHED',
      opUserId: operatorId,
      role,
      ts: now,
      remark: 'finish_service'
    });

    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'finish',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'finish',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'finish_failed',
      requestId
    });
    throw err;
  }

  return {
    order: {
      ...order,
      status: 'FINISHED',
      finishedAt: now,
      updatedAt: now
    }
  };
});
