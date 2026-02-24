/**
 * notifications-delete 云函数 —— 删除（逻辑软删除）通知
 *
 * 【业务说明】
 * 仅通知归属用户本人可执行删除操作，采用软删除：
 * - 设置 isDeleted=true（前端查询默认过滤 isDeleted 记录）
 * - 同时强制标记已读（isRead=true），避免未读计数残留脏数据
 * - 返回 unreadReduced 供前端在本地修正未读标记数，无需重新拉取列表
 *
 * 【权限】
 * - 登录用户均可调用（user / admin / barber），但只能删除自己的通知
 */
// 通知删除：仅允许通知归属用户删除自己的通知
const { withResponse, requireRole, ApiError } = require('sb-common');
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user', 'admin', 'barber'], event, context);
  const userId = user._id || user.uid || user.userId;
  const notificationId = (event && event.notificationId) || '';

  if (!notificationId) {
    throw new ApiError(400, 'notificationId is required');
  }

  const db = uniCloud.database();
  const notifRes = await db.collection('notifications')
    .doc(notificationId)
    .field({ userId: true, isRead: true, isDeleted: true })
    .get();

  const notification = notifRes.data && notifRes.data[0];
  if (!notification) {
    throw new ApiError(404, 'notification not found');
  }
  if (notification.userId !== userId) {
    throw new ApiError(403, 'forbidden');
  }

  // 幂等：已删除则直接返回
  if (notification.isDeleted === true) {
    return {
      success: true,
      unreadReduced: 0
    };
  }

  await db.collection('notifications').doc(notificationId).update({
    isDeleted: true,
    isRead: true,
    deletedAt: Date.now()
  });

  return {
    success: true,
    unreadReduced: notification.isRead ? 0 : 1
  };
});
