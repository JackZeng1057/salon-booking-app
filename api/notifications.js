/**
 * @file api/notifications.js — 消息通知前端 API 封装
 *
 * 【职责定位】
 * 封装系统通知相关的 callCloud 调用，
 * 供通知列表页（pages/user/notifications/）和首页角标使用。
 * 所有角色（user / barber / admin）共用同一套通知接口，
 * 后端按 userId 字段自动隔离各自的通知数据，无需前端传角色。
 *
 * 【通知写入时机（由各业务云函数触发）】
 * 通知数据由其他业务云函数在操作成功后异步写入 notifications 集合，
 * 本模块只负责"读取"和"标记已读/删除"，不涉及通知创建逻辑。
 * 示例触发场景：
 *   - orders-create   ：向 user/barber/admin 各发一条预约成功通知
 *   - orders-cancel   ：通知预约取消相关方（含取消原因）
 *   - barber-application-review：通知理发师审核结果
 *
 * 【未读数角标优化】
 * getUnreadCount() 通过传 pageSize=1 + unreadOnly=true 的最小请求，
 * 利用云函数返回的聚合字段 unreadCount 获取未读总数，
 * 避免拉取完整列表，降低带宽与云函数计算开销，
 * 适合首页/Tab 栏角标的高频轮询或 App 切回前台时的快速更新。
 */
import { callCloud } from './client';

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
