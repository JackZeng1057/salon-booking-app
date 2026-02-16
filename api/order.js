import { callCloud } from './client';
import { getCache, setCache, removeCacheByPrefix } from '../utils/cache';

// 订单相关 API 封装：统一缓存粒度与缓存失效策略
// - 列表、详情、明细、日志、评价分别设定 TTL
// - 状态变更类操作后清理所有订单相关缓存
const LIST_TTL = 5 * 60 * 1000; // 5 分钟
const DETAIL_TTL = 2 * 60 * 1000; // 2 分钟
const REVIEW_TTL = 10 * 60 * 1000; // 10 分钟
const REVIEW_MINE_TTL = 2 * 60 * 1000; // 2 分钟
const ITEM_TTL = 10 * 60 * 1000; // 10 分钟
const EVENT_TTL = 10 * 60 * 1000; // 10 分钟

function cachedCall(key, fn, ttl = LIST_TTL) {
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return fn().then((data) => {
    // 统一缓存落地，减少重复请求
    setCache(key, data, ttl);
    return data;
  });
}

function normalizeListResponse(data) {
  // 兼容旧格式：云函数返回数组时包装为 list 结构
  if (Array.isArray(data)) {
    return { list: data, lastSyncAt: 0 };
  }
  if (data && Array.isArray(data.list)) {
    return data;
  }
  return { list: [], lastSyncAt: 0 };
}

function clearOrderCaches() {
  // 订单变更会影响列表、详情、明细、评价、日志等多个页面
  removeCacheByPrefix('orders-mine:');
  removeCacheByPrefix('orders-detail:');
  removeCacheByPrefix('orders-store-list:');
  removeCacheByPrefix('orders-barber-list:');
  removeCacheByPrefix('order-items:');
  removeCacheByPrefix('order-events:');
  removeCacheByPrefix('reviews-by-order:');
  removeCacheByPrefix('aftersales-store-list:');
  // 订单变更可能影响占用时段，需要同步清理时段缓存
  removeCacheByPrefix('barber-slots:');
}

function clearReviewCaches() {
  removeCacheByPrefix('reviews-by-order:');
  removeCacheByPrefix('reviews-mine:');
  // 评价变更会影响门店评分展示
  removeCacheByPrefix('stores-detail:');
  removeCacheByPrefix('stores-list:');
}

// 创建预约订单
// 入参：{ storeId, serviceId, barberId, date, startTime }
export function createOrder(payload) {
  return callCloud('orders-create', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 获取订单详情
// 入参：{ id }
export function fetchOrderDetail(payload) {
  const id = payload && payload.id;
  const key = `orders-detail:${id || ''}`;
  return cachedCall(key, () => callCloud('orders-detail', payload), DETAIL_TTL);
}

// 获取我的订单列表
export function fetchOrderList(params = {}) {
  const key = `orders-mine:${params.status || ''}:${params.page || 1}:${params.pageSize || 10}`;
  if (params.lastSyncAt) {
    return callCloud('orders-mine', params).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-mine', params).then(normalizeListResponse));
}

// 取消预约
// 入参：{ orderId, reason }
export function cancelOrder(payload) {
  return callCloud('orders-cancel', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 改期预约
// 入参：{ orderId, newDate, newStartTime }
export function rescheduleOrder(payload) {
  return callCloud('orders-reschedule', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 开始服务
// 入参：{ orderId }
export function startService(payload) {
  return callCloud('orders-start-service', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 完成服务
// 入参：{ orderId }
export function finishService(payload) {
  return callCloud('orders-finish-service', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 标记爽约
// 入参：{ orderId, reason? }
export function markNoShow(payload) {
  return callCloud('orders-no-show', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 删除订单（仅已取消/已完成）
// 入参：{ orderId }
export function deleteOrder(payload) {
  return callCloud('orders-delete', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 理发师订单列表
// 入参：{ date }
export function fetchBarberOrders(payload) {
  const key = `orders-barber-list:${payload && payload.date ? payload.date : ''}`;
  if (payload && payload.lastSyncAt) {
    return callCloud('orders-barber-list', payload).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-barber-list', payload).then(normalizeListResponse));
}

// 门店订单列表
// 入参：{ date }
export function fetchStoreOrders(payload) {
  const key = `orders-store-list:${payload && payload.date ? payload.date : ''}`;
  if (payload && payload.lastSyncAt) {
    return callCloud('orders-store-list', payload).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-store-list', payload).then(normalizeListResponse));
}

// 创建评价
// 入参：{ orderId, rating, content }
export function createReview(payload) {
  return callCloud('reviews-create', payload).then((data) => {
    clearOrderCaches();
    clearReviewCaches();
    return data;
  });
}

// 查询评价
// 入参：{ orderId }
export function fetchReviewByOrder(payload) {
  const key = `reviews-by-order:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('reviews-by-order', payload), REVIEW_TTL);
}

// 获取我的评价列表
// 入参：{ page, pageSize }
export function fetchMyReviews(params = {}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const key = `reviews-mine:${page}:${pageSize}`;
  return cachedCall(key, () => callCloud('reviews-mine', params), REVIEW_MINE_TTL);
}

// 删除我的评价
// 入参：{ reviewId }
export function deleteReview(payload) {
  return callCloud('reviews-delete', payload).then((data) => {
    clearReviewCaches();
    return data;
  });
}

// 订单明细项
// 入参：{ orderId }
export function fetchOrderItems(payload) {
  const key = `order-items:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('orders-items-list', payload), ITEM_TTL);
}

// 订单事件日志
// 入参：{ orderId }
export function fetchOrderEvents(payload) {
  const key = `order-events:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('orders-events-list', payload), EVENT_TTL);
}

// 提交售后
// 入参：{ orderId, type, content }
export function createAftersale(payload) {
  return callCloud('aftersales-create', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 门店售后列表
// 入参：{ status }
export function fetchAftersales(payload) {
  const key = `aftersales-store-list:${payload && payload.status ? payload.status : ''}`;
  return cachedCall(key, () => callCloud('aftersales-store-list', payload));
}

// 门店处理售后
// 入参：{ id, reply, status }
export function replyAftersale(payload) {
  return callCloud('aftersales-reply', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}
