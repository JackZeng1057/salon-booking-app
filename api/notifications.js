import { callCloud } from './client';

export function fetchNotifications(params = {}) {
  return callCloud('notifications-list', params || {});
}

export function markNotificationsRead(params = {}) {
  return callCloud('notifications-mark-read', params || {});
}

export function deleteNotification(params = {}) {
  return callCloud('notifications-delete', params || {});
}

export async function getUnreadCount() {
  const res = await callCloud('notifications-list', {
    unreadOnly: true,
    page: 1,
    pageSize: 1
  });
  return (res && res.unreadCount) || 0;
}
