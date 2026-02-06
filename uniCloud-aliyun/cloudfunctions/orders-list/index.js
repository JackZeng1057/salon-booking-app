const { withResponse, requireLogin } = require('sb-common');

// 获取当前用户的订单列表（含门店/服务/理发师关联信息）
exports.main = withResponse(async (event, context) => {
  // 权限校验：需要登录
  const user = await requireLogin(event, context);

  const db = uniCloud.database();
  const _ = db.command;
  const userId = user._id || user.uid || user.userId;

  // 仅返回当前用户订单（用户端列表）
  const orderRes = await db
    .collection('orders')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .get();

  const orders = orderRes.data || [];

  // 收集关联 ID
  const storeIds = Array.from(new Set(orders.map((o) => o.storeId).filter(Boolean)));
  const serviceIds = Array.from(new Set(orders.map((o) => o.serviceId).filter(Boolean)));
  const barberIds = Array.from(new Set(orders.map((o) => o.barberId).filter(Boolean)));

  // 批量查询关联数据
  const [storeRes, serviceRes, barberRes] = await Promise.all([
    storeIds.length ? db.collection('stores').where({ _id: _.in(storeIds) }).get() : { data: [] },
    serviceIds.length ? db.collection('services').where({ _id: _.in(serviceIds) }).get() : { data: [] },
    barberIds.length ? db.collection('users').where({ _id: _.in(barberIds) }).get() : { data: [] }
  ]);

  const storeMap = new Map((storeRes.data || []).map((item) => [item._id, item]));
  const serviceMap = new Map((serviceRes.data || []).map((item) => [item._id, item]));
  const barberMap = new Map((barberRes.data || []).map((item) => [item._id, item]));

  // 组装返回数据
  const list = orders.map((order) => ({
    order,
    store: storeMap.get(order.storeId) || null,
    service: serviceMap.get(order.serviceId) || null,
    barber: barberMap.get(order.barberId) || null
  }));

  return list;
});
