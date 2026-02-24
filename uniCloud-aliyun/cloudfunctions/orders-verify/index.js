/**
 * @file orders-verify/index.js — 到店核验云函数
 *
 * 【业务定位】
 * 实现订单状态机中 BOOKED → ARRIVED 这一关键转换，
 * 对应顾客持核验码到店、门店管理员扫码/手工输入确认的业务场景。
 *
 * 【核验码设计】
 * verifyCode 是在 orders-create 阶段生成的 6 位纯数字随机码。
 * 采用短码格式（非 UUID），方便门店工作人员口头核对或在小屏设备手动输入，
 * 降低操作门槛。本接口以 verifyCode 为 where 条件查询订单，
 * 确保门店无需知道内部 orderId 即可完成核验。
 *
 * 【权限设计】
 * 仅 admin 角色可调用，防止顾客或理发师自行将订单标记为已到店。
 * 同时校验 admin.storeId === order.storeId，防止跨门店核验。
 *
 * 【幂等性】
 * 重复核验同一订单时，若已为 ARRIVED 状态，直接返回成功（不报错），
 * 避免网络重试场景导致前端收到错误提示。
 *
 * 【返回值优化】
 * 核验成功后拼装 order 快照返回，无需再次查询数据库，减少读操作次数。
 */
const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 核验到店（BOOKED -> ARRIVED）：仅门店管理员可操作
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 admin 可核验
  const admin = await requireRole(['admin'], event, context);

  const verifyCode = (event && event.verifyCode) || '';
  if (!verifyCode) {
    throw new ApiError(400, 'verifyCode required');
  }

  const db = uniCloud.database();

  // 根据核验码查询订单
  const orderRes = await db
    .collection('orders')
    .where({ verifyCode })
    // 仅取核验与展示所需字段，减少读取量
    .field({
      _id: true,
      storeId: true,
      status: true,
      orderNo: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .limit(1)
    .get();

  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 仅允许核验本店订单
  if (admin.storeId && order.storeId !== admin.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 幂等：已 ARRIVED 直接返回
  if (order.status === 'ARRIVED') {
    return { order };
  }

  // 状态校验：仅 BOOKED 可核验
  if (order.status !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const now = Date.now();
  const verifiedBy = admin._id || admin.uid || admin.userId;
  try {
    // 更新状态为 ARRIVED
    await db.collection('orders').doc(order._id).update({
      status: 'ARRIVED',
      arrivedAt: now,
      verifiedBy,
      updatedAt: now
    });

    await logOrderEvent(db, {
      orderId: order._id,
      fromStatus: order.status,
      toStatus: 'ARRIVED',
      opUserId: verifiedBy,
      role: 'admin',
      ts: now,
      remark: 'verify'
    });

    await logAudit(db, {
      actorId: verifiedBy,
      role: 'admin',
      action: 'verify',
      orderId: order._id,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    await logAudit(db, {
      actorId: verifiedBy,
      role: 'admin',
      action: 'verify',
      orderId: order._id,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'verify_failed',
      requestId
    });
    throw err;
  }

  // 直接拼装返回，避免二次读取
  return {
    order: {
      ...order,
      status: 'ARRIVED',
      arrivedAt: now,
      verifiedBy,
      updatedAt: now
    }
  };
});
