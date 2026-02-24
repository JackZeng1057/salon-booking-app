/**
 * @file utils/status.js — 订单与时段状态文案映射
 *
 * 【职责定位】
 * 将后端存储的英文枚举值（如 'BOOKED'/'FINISHED'/'CANCELLED'）
 * 转换为用户界面展示的中文文案（如 '已预约'/'已完成'/'已取消'）。
 *
 * 【集中管理的好处】
 * 所有文案统一在此维护，UI 层直接调用 formatOrderStatus(status)，
 * 避免在多个页面分散定义映射表造成不一致（如同一状态不同页面显示不同文字）。
 *
 * 【订单状态机枚举（ORDER_STATUS_TEXT）】
 * BOOKED     → 已预约    （orders-create 写入）
 * ARRIVED    → 已到店    （orders-verify 写入）
 * IN_SERVICE → 服务中    （orders-start-service 写入）
 * FINISHED   → 已完成    （orders-finish-service 写入）
 * CANCELLED  → 已取消    （orders-cancel / 用户主动取消）
 * NO_SHOW    → 爽约      （autoCancelOverdueBookedOrders 自动写入 / orders-no-show 手动写入）
 *
 * 【时段状态枚举（SLOT_STATUS_TEXT）】
 * AVAILABLE  → 可预约
 * BOOKED     → 已预约    （已被他人锁定）
 * EXPIRED    → 已过期    （当天已超过开始时间 5 分钟前截止窗口）
 * UNAVAILABLE → 不可预约 （起始 slot 可用，但服务时长内存在障碍）
 *
 * 【formatSlotStatus 的大小写容错】
 * 云函数偶尔可能返回小写或混写的状态值，
 * 先精确匹配，再 toUpperCase() 后匹配，两级容错保证始终返回中文文案。
 */
// 订单与时段状态文案映射：统一前端展示用词
const ORDER_STATUS_TEXT = {
  BOOKED: '已预约',
  ARRIVED: '已到店',
  IN_SERVICE: '服务中',
  FINISHED: '已完成',
  CANCELLED: '已取消',
  NO_SHOW: '爽约'
};

// 时段状态（包含过期/不可预约，用于时间窗口场景）
const SLOT_STATUS_TEXT = {
  AVAILABLE: '可预约',
  BOOKED: '已预约',
  EXPIRED: '已过期',
  UNAVAILABLE: '不可预约'
};

const AFTERSALE_STATUS_TEXT = {
  OPEN: '待处理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  REJECTED: '未通过'
};

const AFTERSALE_TYPE_TEXT = {
  SERVICE: '服务问题',
  NO_SHOW: '迟到/爽约',
  OTHER: '其他'
};

export function formatOrderStatus(status) {
  // 若无映射则回退原值，避免未知状态被清空
  return ORDER_STATUS_TEXT[status] || status || '';
}

export function formatSlotStatus(status) {
  // 兼容后端返回大小写混用的状态值
  if (!status) return '';
  if (SLOT_STATUS_TEXT[status]) return SLOT_STATUS_TEXT[status];
  const upper = String(status).toUpperCase();
  if (SLOT_STATUS_TEXT[upper]) return SLOT_STATUS_TEXT[upper];
  return status || '';
}

export function formatAftersaleStatus(status) {
  if (!status) return '';
  const normalized = String(status).toUpperCase();
  return AFTERSALE_STATUS_TEXT[normalized] || status || '';
}

export function formatAftersaleType(type) {
  return AFTERSALE_TYPE_TEXT[type] || type || '';
}
