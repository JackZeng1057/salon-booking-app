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
// 额外能力：
// - 读取详情前懒触发“超时未到店自动爽约”；
// - 返回时附加排队提示字段，供前端直接展示。
exports.main = withResponse(async (event, context) => {
  // 权限校验：需要登录
  const user = await requireLogin(event, context);

  const id = (event && event.id) || '';
  if (!id) {
    throw new ApiError(400, 'order id required');
  }

  const db = uniCloud.database();
  // 详情读取字段白名单：只暴露前端所需快照字段，避免额外敏感数据外泄。
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
    // 自动爽约失败不阻断详情查询，避免用户看不到订单。
    console.error('auto no_show overdue orders (detail) failed:', err);
  }

  // 自动爽约后回读一次订单，确保返回状态是最新结果。
  const latestRes = await db
    .collection('orders')
    .doc(id)
    .field(orderField)
    .get();
  const latestOrder = latestRes.data && latestRes.data[0];

  const finalOrder = latestOrder || order;
  // 计算排队提示并附着到订单对象中（如 queueAheadCount / queueWaitMin）。
  const queueHintMap = await buildQueueHintMap(db, finalOrder ? [finalOrder] : []);
  const enriched = attachQueueHints(finalOrder ? [finalOrder] : [], queueHintMap);

  return {
    order: enriched[0] || finalOrder
  };
});
