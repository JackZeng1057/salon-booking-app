const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 创建售后工单：仅订单所属用户可提交
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const type = (event && event.type) || '';
  const content = (event && event.content) || '';

  if (!orderId || !type) {
    throw new ApiError(400, 'orderId and type required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const now = Date.now();
  const res = await db.collection('aftersales').add({
    orderId,
    userId,
    storeId: order.storeId,
    type,
    content,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now
  });

  return { id: res.id || (res.ids && res.ids[0]) || '' };
});
