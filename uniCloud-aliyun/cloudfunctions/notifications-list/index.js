// 通知列表：按用户分页查询并返回未读数
// 引入统一响应包装
const { withResponse, requireRole } = require('sb-common');

/**
 * 获取用户通知列表
 */
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);
  const userId = user._id || user.uid || user.userId;

  const db = uniCloud.database();

  // 分页参数
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 20);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;

  // 是否只看未读
  const unreadOnly = event && event.unreadOnly;

  // 构建查询条件
  let whereConditions = { userId };
  if (unreadOnly) {
    whereConditions.isRead = false;
  }

  // 查询通知列表
  const res = await db.collection('notifications')
    .where(whereConditions)
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safeSize)
    .limit(safeSize)
    .get();

  // 查询未读数量
  const unreadRes = await db.collection('notifications')
    .where({ userId, isRead: false })
    .count();

  return {
    list: res.data || [],
    unreadCount: unreadRes.total || 0,
    page: safePage,
    pageSize: safeSize
  };
});
