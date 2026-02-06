const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit } = require('sb-common');

// 删除订单（逻辑删除，仅已取消/已完成）
// - user 标记 deletedByUser
// - admin 标记 deletedByStore
exports.main = withResponse(async (event, context) => {
  // 读取请求追踪 ID，便于审计与问题定位
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 user/admin 可删除
  const operator = await requireRole(['user', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true,
      status: true,
      deletedByUser: true,
      deletedByStore: true,
      updatedAt: true
    })
    .get();

  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  const role = operator.role || operator.type || '';
  const operatorId = operator._id || operator.uid || operator.userId;
  const now = Date.now();

  // 仅允许已取消/已完成订单删除
  if (order.status !== 'CANCELLED' && order.status !== 'FINISHED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  if (role === 'user') {
    // 用户仅能删除自己的订单
    if (order.userId !== operatorId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
    }
    if (order.deletedByUser) {
      return { order };
    }
    await db.collection('orders').doc(orderId).update({
      deletedByUser: true,
      deletedByUserAt: now,
      updatedAt: now
    });

    // 记录审计日志，方便后台追踪
    await logAudit(db, {
      actorId: operatorId,
      role: 'user',
      action: 'delete',
      orderId,
      time: now,
      result: 'success',
      requestId
    });

    return {
      order: {
        ...order,
        deletedByUser: true,
        deletedByUserAt: now,
        updatedAt: now
      }
    };
  }

  if (role === 'admin') {
    // 店家仅能删除本店订单
    if (operator.storeId && order.storeId !== operator.storeId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
    }
    if (order.deletedByStore) {
      return { order };
    }
    await db.collection('orders').doc(orderId).update({
      deletedByStore: true,
      deletedByStoreAt: now,
      updatedAt: now
    });

    // 记录审计日志，方便后台追踪
    await logAudit(db, {
      actorId: operatorId,
      role: 'admin',
      action: 'delete',
      orderId,
      time: now,
      result: 'success',
      requestId
    });

    return {
      order: {
        ...order,
        deletedByStore: true,
        deletedByStoreAt: now,
        updatedAt: now
      }
    };
  }

  throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
});
