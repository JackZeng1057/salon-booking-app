/**
 * orders-barber-list 云函数 —— 理发师订单列表
 *
 * 【业务说明】
 * 理发师端用于查看本人指定日期的全部订单。
 * 支持 lastSyncAt 增量同步：只返回自上次同步后更新的订单，除少云函数设置开销。
 *
 * 【附加能力】
 * - 入口触发自动爱约：将超时未坏约的订单自动标记为 NO_SHOW
 * - 分页参数类型安全转换，防止云函数因非法数字类型报错
 *
 * 【权限】
 * - 仅 barber 角色可访问
 * - 强制要求传入 date 参数，防止全量扫描数据库
 */
const { withResponse, ApiError, requireRole, autoCancelOverdueBookedOrders } = require('sb-common');

// 理发师查看当天订单（支持增量同步与分页）
exports.main = withResponse(async (event, context) => {
  const barber = await requireRole(['barber'], event, context);
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
  const barberId = barber._id || barber.uid || barber.userId;

  // 自动标记理发师名下已超时且未处理的预约单为爽约
  try {
    await autoCancelOverdueBookedOrders(db, { barberId, limit: 200, graceMin: 20 });
  } catch (err) {
    console.error('auto no_show overdue orders (barber) failed:', err);
  }

  // 仅查询本人指定日期订单
  const where = { barberId, date };
  if (lastSyncAt > 0) {
    where.updatedAt = db.command.gt(lastSyncAt);
  }

  // 增量同步（lastSyncAt>0）：按 updatedAt 降序、skip=0 返回该时间后全部变更；全量模式按startTime升序并正常分页
  const res = await db
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
