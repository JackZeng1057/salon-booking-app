/**
 * orders-store-list 云函数 —— 门店当日订单列表
 *
 * 【业务说明】
 * 返回管理员所店指定日期的全部订单列表，管理员在订单管理页调用。
 * 已被门店软删除的订单不展示。
 *
 * 【附加能力】
 * - 入口懒触发自动爱约：将该门店超时未处理的订单标记为 NO_SHOW
 * - 返回列表附带排队提示字段
 *
 * 【权限】
 * - 仅 admin 角色可访问
 * - 强制要求传入 date 参数
 */
const {
  withResponse,
  ApiError,
  requireRole,
  autoCancelOverdueBookedOrders,
  buildQueueHintMap,
  attachQueueHints
} = require('sb-common');

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

  // 自动标记本店已超时且未处理的预约单为爽约
  try {
    await autoCancelOverdueBookedOrders(db, { storeId, limit: 200, graceMin: 20 });
  } catch (err) {
    console.error('auto no_show overdue orders (store) failed:', err);
  }

  // 仅查询本店指定日期订单
  const where = { storeId, date, deletedByStore: db.command.neq(true) };
  if (lastSyncAt > 0) {
    where.updatedAt = db.command.gt(lastSyncAt);
  }

  // 全量模式按 startTime 倒序，增量模式按 updatedAt 倒序，统一“最新优先”的列表体验
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
      arrivedAt: true,
      inServiceAt: true,
      orderNo: true,
      verifyCode: true,
      updatedAt: true
    })
    .orderBy(lastSyncAt > 0 ? 'updatedAt' : 'startTime', 'desc')
    .skip(lastSyncAt > 0 ? 0 : (safePage - 1) * safeSize)
    .limit(lastSyncAt > 0 ? Math.min(limit, 100) : safeSize)
    .get();

  const rawList = res.data || [];
  // buildQueueHintMap：查询同时段已 BOOKED 订单数，生成时段→排队人数映射
  // attachQueueHints：将排队位置写入每条订单，前端展示「您前面还有X人」
  const queueHintMap = await buildQueueHintMap(db, rawList);
  const list = attachQueueHints(rawList, queueHintMap);
  const latestSyncAt = list.reduce((max, item) => Math.max(max, Number(item.updatedAt || 0)), lastSyncAt || 0);
  return {
    list,
    lastSyncAt: latestSyncAt
  };
});
