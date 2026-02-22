import { callCloud } from './client';

/**
 * 消息通知 API 封装
 * 约定：
 * 1) 统一通过云函数读写通知数据
 * 2) 页面层只关心业务参数，不直接拼接云函数调用细节
 */

// 获取通知列表（支持分页、只看未读等筛选参数）
export function fetchNotifications(params = {}) {
  return callCloud('notifications-list', params || {});
}

// 批量/按条件标记通知已读
export function markNotificationsRead(params = {}) {
  return callCloud('notifications-mark-read', params || {});
}

// 删除单条通知
export function deleteNotification(params = {}) {
  return callCloud('notifications-delete', params || {});
}

// 读取当前未读总数（只请求 1 条，优先拿后端统计字段以降低开销）
export async function getUnreadCount() {
  const res = await callCloud('notifications-list', {
    unreadOnly: true,
    page: 1,
    pageSize: 1
  });
  return (res && res.unreadCount) || 0;
}
