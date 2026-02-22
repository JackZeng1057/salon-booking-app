const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 开始服务（ARRIVED -> IN_SERVICE）
// 说明：该操作是订单核心状态流转节点，必须严格校验权限与前置状态。
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const operator = await requireRole(['barber', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  // 只读取状态流转和权限判断所需字段，避免无用字段带来额外读负担。
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
  // 幂等：重复点击“开始服务”时直接返回当前状态，避免重复写库。
  if (order.status === 'IN_SERVICE') {
    return { order };
  }

  const operatorId = operator._id || operator.uid || operator.userId;
  const nowTs = now;
  try {
    // 状态机保护：只有 ARRIVED 才允许转 IN_SERVICE，禁止跨状态跳转。
    if (order.status !== 'ARRIVED') {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
    }

    // 更新订单状态并记录服务开始时间。
    await db.collection('orders').doc(orderId).update({
      status: 'IN_SERVICE',
      inServiceAt: nowTs,
      updatedAt: nowTs
    });

    // 写订单事件日志：用于订单时间线展示与审计追踪。
    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: 'IN_SERVICE',
      opUserId: operatorId,
      role,
      ts: nowTs,
      remark: 'start_service'
    });

    // 写审计日志：用于后台追踪谁在何时触发了状态切换。
    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'start',
      orderId,
      time: nowTs,
      result: 'success',
      requestId
    });

    // 返回合并后的最新状态，减少前端再次查询。
    return {
      order: {
        ...order,
        status: 'IN_SERVICE',
        inServiceAt: nowTs,
        updatedAt: nowTs
      }
    };
  } catch (err) {
    // 失败同样落审计日志，便于排查权限或状态异常。
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
