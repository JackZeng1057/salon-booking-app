// 通知已读标记：支持单条或全部
// 引入统一响应包装
const { withResponse, requireRole, ApiError } = require('sb-common');

/**
 * 标记通知为已读
 */
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user', 'admin', 'barber'], event, context);
  const userId = user._id || user.uid || user.userId;

  const notificationId = event && event.notificationId;
  const markAll = event && event.markAll; // 是否标记全部为已读

  const db = uniCloud.database();

  if (markAll) {
    // 标记全部为已读
    await db.collection('notifications')
      .where({ userId, isRead: false })
      .update({ isRead: true });
    return { success: true, message: 'All marked as read' };
  }

  if (!notificationId) {
    throw new ApiError(400, 'notificationId is required');
  }

  // 验证通知归属
  const notifRes = await db.collection('notifications')
    .doc(notificationId)
    .field({ userId: true })
    .get();

  const notification = notifRes.data && notifRes.data[0];
  if (!notification) {
    throw new ApiError(404, 'notification not found');
  }

  if (notification.userId !== userId) {
    throw new ApiError(403, 'forbidden');
  }

  // 标记为已读
  await db.collection('notifications')
    .doc(notificationId)
    .update({ isRead: true });

  return { success: true };
});
