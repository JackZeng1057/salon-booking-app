/**
 * orders-no-show 云函数 —— 管理员手动标记顾客爽约
 *
 * 【业务说明】
 * 预约时段开始后超过阈值时间仍未到店，管理员可将订单标记为 NO_SHOW。
 * 状态流转：BOOKED → NO_SHOW（不可逆，不经过 ARRIVED/IN_SERVICE）
 *
 * 【超时阈值判断】
 * thresholdMin 参数由调用方传入（默认 20 分钟），
 * 服务端计算：当前时间 >= 预约开始时间 + thresholdMin × 60 × 1000 ms
 * 未超时则抛出 not_overdue，禁止提前标记。
 *
 * 【幂等保护】
 * 若订单已是 NO_SHOW 直接返回，不报错，支持幂等重试。
 *
 * 【权限】
 * - 仅 admin 角色可调用
 * - 门店隔离：只能操作与自身 storeId 匹配的订单
 */
const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 状态归一化，兼容中文状态值
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

// 中国时区日期时间转毫秒时间戳（格式 "2025-06-01" + "09:30"）
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

  // 管理员只能操作自己门店订单
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

  // 超时阈值校验：当前时间须超过 "预约开始时间 + thresholdMin 分钟" 才允许标记爽约
  const startMs = toChinaTimestamp(order.date, order.startTime);
  if (!startMs || Date.now() < startMs + thresholdMin * 60 * 1000) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'not_overdue');
  }

  const now = Date.now();
  const adminId = admin._id || admin.uid || admin.userId;

  try {
    // 订单状态更新 + 事件日志 + 审计日志
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
