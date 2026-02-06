const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 标记爽约（BOOKED -> NO_SHOW）
// - 兼容中文状态值
// - 使用 endTime 或阈值判断是否已超时
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const admin = await requireRole(['admin'], event, context);

  const orderId = (event && event.orderId) || '';
  const reason = (event && event.reason) || '';
  const thresholdMin = Number((event && event.thresholdMin) || 15);

  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      status: true,
      storeId: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  if (admin.storeId && order.storeId !== admin.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const normalizeStatus = (status) => {
    const map = {
      已预约: 'BOOKED',
      已到店: 'ARRIVED',
      服务中: 'IN_SERVICE',
      已完成: 'FINISHED',
      已取消: 'CANCELLED',
      爽约: 'NO_SHOW'
    };
    return map[status] || status;
  };

  const normalizedStatus = normalizeStatus(order.status);

  // 幂等：已爽约直接返回
  if (normalizedStatus === 'NO_SHOW') {
    return { order };
  }

  // 状态校验：仅 BOOKED 可标记爽约
  if (normalizedStatus !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  // 超时校验：优先 endTime，若缺失则使用 startTime + 阈值
  const startMs = order.date && order.startTime
    ? new Date(`${order.date}T${order.startTime}:00+08:00`).getTime()
    : 0;
  const endMs = order.date && order.endTime
    ? new Date(`${order.date}T${order.endTime}:00+08:00`).getTime()
    : 0;
  if (endMs && Date.now() < endMs) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'not_overdue');
  }
  if (!endMs && startMs && Date.now() - startMs < thresholdMin * 60 * 1000) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'not_overdue');
  }

  const now = Date.now();
  const adminId = admin._id || admin.uid || admin.userId;
  try {
    await db.collection('orders').doc(orderId).update({
      status: 'NO_SHOW',
      noShowAt: now,
      noShowReason: reason || '',
      updatedAt: now
    });

    await logOrderEvent(db, {
      orderId,
      fromStatus: normalizedStatus,
      toStatus: 'NO_SHOW',
      opUserId: adminId,
      role: 'admin',
      ts: now,
      remark: reason || 'no_show'
    });

    await logAudit(db, {
      actorId: adminId,
      role: 'admin',
      action: 'no_show',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    await logAudit(db, {
      actorId: adminId,
      role: 'admin',
      action: 'no_show',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'no_show_failed',
      requestId
    });
    throw err;
  }

  return {
    order: {
      ...order,
      status: 'NO_SHOW',
      noShowAt: now,
      noShowReason: reason || '',
      updatedAt: now
    }
  };
});
