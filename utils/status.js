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
  return AFTERSALE_STATUS_TEXT[status] || status || '';
}

export function formatAftersaleType(type) {
  return AFTERSALE_TYPE_TEXT[type] || type || '';
}
