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
    .field({ userId: true, isRead: true })
    .get();

  const notification = notifRes.data && notifRes.data[0];
  if (!notification) {
    throw new ApiError(404, 'notification not found');
  }
  if (notification.userId !== userId) {
    throw new ApiError(403, 'forbidden');
  }

  await db.collection('notifications').doc(notificationId).remove();

  return {
    success: true,
    unreadReduced: notification.isRead ? 0 : 1
  };
});

