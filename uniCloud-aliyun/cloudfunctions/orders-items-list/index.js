/**
 * orders-items-list 云函数 —— 订单服务小项列表
 *
 * 【业务说明】
 * 返回指定订单下的服务小项（order_items 集合）。
 * order_items 采用拆分设计，支持未来扩展为单次订单包含多个服务项目的场景。
 *
 * 【权限】
 * - 需要登录（requireLogin）
 * - user 只能查询自己订单； admin/barber 需在各自属管范围内
 */
const { withResponse, ApiError, ERROR_CODES, requireLogin } = require('sb-common');

// 订单明细列表：按订单查询并做权限校验
exports.main = withResponse(async (event, context) => {
  const user = await requireLogin(event, context);
  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;
  const role = user.role || user.type || '';

  // 先校验订单归属，再查询明细，避免越权读数据
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({ userId: true, storeId: true, barberId: true })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  if (role === 'user' && order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (role === 'admin' && user.storeId && order.storeId !== user.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (role === 'barber' && order.barberId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 返回订单明细项（创建时间正序）
  const res = await db
    .collection('order_items')
    .where({ orderId })
    .field({ serviceId: true, name: true, price: true, qty: true })
    .orderBy('createdAt', 'asc')
    .get();

  return { list: res.data || [] };
});
