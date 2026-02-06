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

  const res = await db
    .collection('order_items')
    .where({ orderId })
    .field({ serviceId: true, name: true, price: true, qty: true })
    .orderBy('createdAt', 'asc')
    .get();

  return { list: res.data || [] };
});
