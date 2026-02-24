/**
 * orders-mine 云函数 —— 用户订单列表
 *
 * 【业务说明】
 * 返回当前登录用户的订单列表，支持按状态筛选与分页加载。
 * 已被用户软删除的订单不展示（过滤 deletedByUser）。
 *
 * 【增量同步】
 * 传入 lastSyncAt 时只返回自该时间后更新的订单，减少相同数据重复载。
 *
 * 【附加能力】
 * - 入口懒触发自动爱约：序列受用 userId 范围限定
 * - 返回列表附带排队提示字段
 *
 * 【权限】
 * - 仅 user 角色可访问
 */
const {
  withResponse,
  requireRole,
  autoCancelOverdueBookedOrders,
  buildQueueHintMap,
  attachQueueHints
} = require('sb-common');

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

  // 自动标记已超时但仍为 BOOKED 的订单为爽约（按当前用户范围）
  try {
    await autoCancelOverdueBookedOrders(db, { userId, limit: 100, graceMin: 20 });
  } catch (err) {
    console.error('auto no_show overdue orders (mine) failed:', err);
  }

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
      arrivedAt: true,
      inServiceAt: true,
      verifyCode: true,
      createdAt: true,
      updatedAt: true
    })
    .orderBy('updatedAt', 'desc')
    // 增量同步（lastSyncAt>0）：skip=0 始终从最新一条开始取，依靠 updatedAt 过滤锁定其中变更项，客户端按 _id 合并到本地列表
    // 全量分页模式（lastSyncAt=0）则按页码正常翻页，适用于首次加载
    .skip(lastSyncAt > 0 ? 0 : (safePage - 1) * safeSize)
    .limit(lastSyncAt > 0 ? Math.min(limit, 50) : safeSize)
    .get();

  const rawOrders = orderRes.data || [];
  // buildQueueHintMap：以 barberId+date+startTime 为键，查询各时段已 BOOKED 订单数，返回排队序号 Map
  // attachQueueHints：将 queueAheadCount（前方人数）和 queueWaitMin（预计等候分钟）写入每条订单，前端据此展示「您前面还有 X 人」
  const queueHintMap = await buildQueueHintMap(db, rawOrders);
  const orders = attachQueueHints(rawOrders, queueHintMap);

  const latestSyncAt = orders.reduce((max, item) => Math.max(max, Number(item.updatedAt || 0)), lastSyncAt || 0);
  return {
    page: safePage,
    pageSize: safeSize,
    list: orders,
    lastSyncAt: latestSyncAt
  };
});
