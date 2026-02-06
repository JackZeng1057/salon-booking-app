const { withResponse, ApiError, requireRole } = require('sb-common');

// 门店查看当天订单
// - 只返回本店指定日期订单
// - 逻辑删除的订单不返回
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  // 强制要求日期参数，避免全量扫描
  const date = (event && event.date) || '';
  if (!date) {
    throw new ApiError(400, 'date required');
  }
  const lastSyncAt = Number((event && event.lastSyncAt) || 0);
  const limit = Number((event && event.limit) || 50);

  // 分页参数（默认第 1 页，每页最多 50）
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 100);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 100;

  const db = uniCloud.database();
  const storeId = admin.storeId || '';

  // 仅查询本店指定日期订单
  const where = { storeId, date, deletedByStore: db.command.neq(true) };
  if (lastSyncAt > 0) {
    where.updatedAt = db.command.gt(lastSyncAt);
  }

  const res = await db
    .collection('orders')
    .where(where)
    .field({
      date: true,
      startTime: true,
      endTime: true,
      serviceId: true,
      serviceName: true,
      barberId: true,
      barberName: true,
      status: true,
      orderNo: true,
      verifyCode: true,
      updatedAt: true
    })
    .orderBy(lastSyncAt > 0 ? 'updatedAt' : 'startTime', lastSyncAt > 0 ? 'desc' : 'asc')
    .skip(lastSyncAt > 0 ? 0 : (safePage - 1) * safeSize)
    .limit(lastSyncAt > 0 ? Math.min(limit, 100) : safeSize)
    .get();

  const list = res.data || [];
  const latestSyncAt = list.reduce((max, item) => Math.max(max, Number(item.updatedAt || 0)), lastSyncAt || 0);
  return {
    list,
    lastSyncAt: latestSyncAt
  };
});
