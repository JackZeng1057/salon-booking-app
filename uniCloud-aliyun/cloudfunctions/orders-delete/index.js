/**
 * orders-delete 云函数 —— 订单逻辑删除
 *
 * 【业务说明】
 * 采用“软删除”策略：不真实删除订单文档，而是添加标志字段
 * （deletedByUser / deletedByStore），保留完整数据便于状态统计和审计追查。
 *
 * 【权限与圭查】
 * - user 只能删除自己的订单
 * - admin 只能删除本店订单
 * - 仅允许删除 CANCELLED / FINISHED 状态的订单（进行中订单不允许删除）。
 *
 * 【审计】
 * 删除操作写入 audit_logs，包含操作者角色与请求追踪 ID。
 */
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
