const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 开始服务（ARRIVED -> IN_SERVICE）：支持门店核验后的直达路径
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
      storeId: true,
      arrivedAt: true,
      verifiedBy: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 权限：barber 只能处理自己的订单；admin 只能处理本店订单
  const role = operator.role || operator.type || '';
  if (role === 'barber' && order.barberId !== (operator._id || operator.uid || operator.userId)) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (role === 'admin' && operator.storeId && order.storeId !== operator.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const now = Date.now();
  // 幂等：已开始服务直接返回
  if (order.status === 'IN_SERVICE') {
    return { order };
  }

  const operatorId = operator._id || operator.uid || operator.userId;
  const nowTs = now;
  try {
    if (order.status !== 'ARRIVED') {
      if (role === 'admin' && order.status === 'BOOKED') {
        const arrivedAt = order.arrivedAt || nowTs;
        const verifiedBy = order.verifiedBy || operatorId;
        await db.collection('orders').doc(orderId).update({
          status: 'IN_SERVICE',
          arrivedAt,
          verifiedBy,
          inServiceAt: nowTs,
          updatedAt: nowTs
        });

        await logOrderEvent(db, {
          orderId,
          fromStatus: order.status,
          toStatus: 'IN_SERVICE',
          opUserId: operatorId,
          role,
          ts: nowTs,
          remark: 'start_service'
        });

        await logAudit(db, {
          actorId: operatorId,
          role,
          action: 'start',
          orderId,
          time: nowTs,
          result: 'success',
          requestId
        });

        return {
          order: {
            ...order,
            status: 'IN_SERVICE',
            arrivedAt,
            verifiedBy,
            inServiceAt: nowTs,
            updatedAt: nowTs
          }
        };
      }
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
    }

    await db.collection('orders').doc(orderId).update({
      status: 'IN_SERVICE',
      inServiceAt: nowTs,
      updatedAt: nowTs
    });

    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: 'IN_SERVICE',
      opUserId: operatorId,
      role,
      ts: nowTs,
      remark: 'start_service'
    });

    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'start',
      orderId,
      time: nowTs,
      result: 'success',
      requestId
    });

    return {
      order: {
        ...order,
        status: 'IN_SERVICE',
        inServiceAt: nowTs,
        updatedAt: nowTs
      }
    };
  } catch (err) {
    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'start',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'start_failed',
      requestId
    });
    throw err;
  }
});
