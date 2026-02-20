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

// 标记爽约（BOOKED -> NO_SHOW）
// 超时规则：超过开始时间 thresholdMin 分钟
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const admin = await requireRole(['admin'], event, context);

  const orderId = (event && event.orderId) || '';
  const reason = (event && event.reason) || '';
  const thresholdMin = Math.max(Number((event && event.thresholdMin) || 20), 0);

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
      startTime: true
    })
    .get();

  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  if (admin.storeId && order.storeId !== admin.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const normalizedStatus = normalizeStatus(order.status);
  if (normalizedStatus === 'NO_SHOW') {
    return { order };
  }
  if (normalizedStatus !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const startMs = toChinaTimestamp(order.date, order.startTime);
  if (!startMs || Date.now() < startMs + thresholdMin * 60 * 1000) {
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
