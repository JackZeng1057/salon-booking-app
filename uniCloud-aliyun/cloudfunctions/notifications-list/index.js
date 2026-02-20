// 通知列表：按用户分页查询并返回未读数
// 引入统一响应包装
const { withResponse, requireRole, autoCancelOverdueBookedOrders } = require('sb-common');

/**
 * 获取用户通知列表
 */
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user', 'admin', 'barber'], event, context);
  const role = user.role || user.type || '';
  const userId = user._id || user.uid || user.userId;

  const db = uniCloud.database();

  // 打开通知页时触发自动爽约，确保消息页能及时看到“已标记爽约”通知
  try {
    const autoOptions = { graceMin: 20, limit: 200 };
    if (role === 'admin' && user.storeId) {
      autoOptions.storeId = user.storeId;
    } else if (role === 'barber') {
      autoOptions.barberId = userId;
    } else {
      autoOptions.userId = userId;
    }
    await autoCancelOverdueBookedOrders(db, autoOptions);
  } catch (err) {
    console.error('auto no_show overdue orders (notifications) failed:', err);
  }

  // 分页参数
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 20);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;

  // 是否只看未读
  const unreadOnly = event && event.unreadOnly;

  // 构建查询条件
  let whereConditions = {
    userId,
    isDeleted: db.command.neq(true)
  };
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
    .where({ userId, isRead: false, isDeleted: db.command.neq(true) })
    .count();

  return {
    list: res.data || [],
    unreadCount: unreadRes.total || 0,
    page: safePage,
    pageSize: safeSize
  };
});
