const {
  withResponse,
  ApiError,
  ERROR_CODES,
  requireLogin,
  autoCancelOverdueBookedOrders,
  buildQueueHintMap,
  attachQueueHints
} = require('sb-common');

// 获取订单详情：包含快照字段并做权限校验
exports.main = withResponse(async (event, context) => {
  // 权限校验：需要登录
  const user = await requireLogin(event, context);

  const id = (event && event.id) || '';
  if (!id) {
    throw new ApiError(400, 'order id required');
  }

  const db = uniCloud.database();
  const orderField = {
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
    arrivedAt: true,
    inServiceAt: true,
    verifyCode: true,
    remark: true
  };

  const orderRes = await db
    .collection('orders')
    .doc(id)
    .field(orderField)
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

  // 懒触发自动爽约：确保打开详情页时，超时订单可及时变更并触发通知
  try {
    const autoOptions = { orderId: id, graceMin: 20, limit: 5 };
    if (role === 'user') {
      autoOptions.userId = userId;
    } else if (role === 'admin' && user.storeId) {
      autoOptions.storeId = user.storeId;
    } else if (role === 'barber') {
      autoOptions.barberId = userId;
    }
    await autoCancelOverdueBookedOrders(db, autoOptions);
  } catch (err) {
    console.error('auto no_show overdue orders (detail) failed:', err);
  }

  const latestRes = await db
    .collection('orders')
    .doc(id)
    .field(orderField)
    .get();
  const latestOrder = latestRes.data && latestRes.data[0];

  const finalOrder = latestOrder || order;
  const queueHintMap = await buildQueueHintMap(db, finalOrder ? [finalOrder] : []);
  const enriched = attachQueueHints(finalOrder ? [finalOrder] : [], queueHintMap);

  return {
    order: enriched[0] || finalOrder
  };
});
