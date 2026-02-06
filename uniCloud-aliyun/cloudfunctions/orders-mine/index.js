const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 获取当前用户的订单列表（支持状态筛选与分页）
// - 逻辑删除的订单不返回
// - 支持 lastSyncAt 增量同步
exports.main = withResponse(async (event, context) => {
  // 权限校验：仅 user 可查询
  const user = await requireRole(['user'], event, context);

  const status = (event && event.status) || '';
  const lastSyncAt = Number((event && event.lastSyncAt) || 0);
  const limit = Number((event && event.limit) || 20);
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 10);

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 10;

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  const where = { userId, deletedByUser: db.command.neq(true) };
  if (status) {
    where.status = status;
  }
  if (lastSyncAt > 0) {
    where.updatedAt = db.command.gt(lastSyncAt);
  }

  const orderRes = await db
    .collection('orders')
    .where(where)
    .field({
      orderNo: true,
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
      createdAt: true,
      updatedAt: true
    })
    .orderBy('updatedAt', 'desc')
    .skip(lastSyncAt > 0 ? 0 : (safePage - 1) * safeSize)
    .limit(lastSyncAt > 0 ? Math.min(limit, 50) : safeSize)
    .get();

  const orders = orderRes.data || [];

  const latestSyncAt = orders.reduce((max, item) => Math.max(max, Number(item.updatedAt || 0)), lastSyncAt || 0);
  return {
    page: safePage,
    pageSize: safeSize,
    list: orders,
    lastSyncAt: latestSyncAt
  };
});
