// 通知删除：仅允许通知归属用户删除自己的通知
const { withResponse, requireRole, ApiError } = require('sb-common');

/**
 * 删除通知云函数（逻辑删除）
 * 规则：
 * 1) 仅通知归属人可删除
 * 2) 删除时强制标记已读
 * 3) 返回 unreadReduced 供前端修正未读数
 */
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
