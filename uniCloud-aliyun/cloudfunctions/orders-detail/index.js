const { withResponse, ApiError, ERROR_CODES, requireLogin } = require('sb-common');

// 获取订单详情：包含快照字段并做权限校验
exports.main = withResponse(async (event, context) => {
  // 权限校验：需要登录
  const user = await requireLogin(event, context);

  const id = (event && event.id) || '';
  if (!id) {
    throw new ApiError(400, 'order id required');
  }

  const db = uniCloud.database();
  const orderRes = await db
    .collection('orders')
    .doc(id)
    .field({
      userId: true,
      storeId: true,
      storeName: true,
      serviceId: true,
      serviceName: true,
      barberId: true,
      barberName: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      verifyCode: true,
      remark: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 仅用户本人可查看（理发师/管理员可查看全部）
  const role = user.role || user.type || '';
  const userId = user._id || user.uid || user.userId;
  if (role === 'user' && order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  return {
    order
  };
});
