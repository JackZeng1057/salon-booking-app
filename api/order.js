/**
 * @file api/order.js — 订单相关前端 API 封装
 *
 * 【职责定位】
 * 封装所有与订单生命周期相关的 callCloud 调用，
 * 是前端页面（pages/order/ 和 pages/user/orders/ 等）的唯一数据入口。
 *
 * 【缓存策略设计】
 * 订单数据具有"写频率低、读频率高"的特点，本模块引入本地内存缓存（utils/cache.js），
 * 减少重复请求的云函数调用次数（节省 uniCloud 资源配额）：
 *   - 订单列表（LIST_TTL=5分钟）：轻度缓存，列表页多次切换不重复请求
 *   - 订单详情（DETAIL_TTL=2分钟）：短缓存，变更类操作后主动失效
 *   - 评价/明细/日志（10分钟）：数据很少变化，较长缓存
 *
 * 【缓存失效规则】
 * 所有状态变更类操作（createOrder/cancelOrder/reschedule/finishService/…）
 * 成功后调用 clearOrderCaches()，批量清理所有以 'orders-' / 'barber-slots:' 为前缀的缓存，
 * 保证下次读取时拿到最新数据。
 *
 * 【增量同步（lastSyncAt）】
 * fetchOrderList / fetchBarberOrders / fetchStoreOrders 支持 lastSyncAt 参数：
 * 传入 lastSyncAt > 0 时跳过本地缓存，直接请求云函数进行增量同步，
 * 适用于下拉刷新、App 从后台切回前台等场景。
 *
 * 【评价与订单的联动缓存】
 * createReview / deleteReview 除了清理评价相关缓存，
 * 还会清理 stores-detail / stores-list 缓存，
 * 因为评价变化会触发门店评分（updateStoreRating）实时更新。
 */
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
  // 命中缓存时直接 resolve，不触发网络请求；
  // 未命中时执行 fn()，成功后写缓存再 resolve。
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return fn().then((data) => {
    // 统一缓存落地，减少重复请求
    setCache(key, data, ttl);
    return data;
  });
}

function normalizeListResponse(data) {
  // 兼容旧格式：云函数返回数组时包装为 list 结构，
  // 保证调用方始终通过 .list 字段读取列表，无需判断返回类型。
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
// 入参：{ storeId, serviceId, barberId, date, startTime, remark? }
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
// 支持 lastSyncAt 增量同步：传入 > 0 时跳过本地缓存，适用于下拉刷新场景。
// 缓存 key 含 status/page/pageSize，不同筛选条件独立缓存互不污染。
// @param {Object} params - { status?, page?, pageSize?, lastSyncAt? }
export function fetchOrderList(params = {}) {
  const key = `orders-mine:${params.status || ''}:${params.page || 1}:${params.pageSize || 10}`;
  if (params.lastSyncAt) {
    return callCloud('orders-mine', params).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-mine', params).then(normalizeListResponse));
}

// 取消预约（成功后清理全量订单缓存，保证列表页展示最新状态）
// @param {Object} payload - { orderId, reason }
export function cancelOrder(payload) {
  return callCloud('orders-cancel', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 改期预约（改期影响原时段与新时段双侧占用，成功后清理全量缓存）
// @param {Object} payload - { orderId, newDate, newStartTime }
export function rescheduleOrder(payload) {
  return callCloud('orders-reschedule', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 开始服务（理发师/管理员端，将订单从 ARRIVED 推进至 IN_SERVICE）
// @param {Object} payload - { orderId }
export function startService(payload) {
  return callCloud('orders-start-service', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 完成服务（将 IN_SERVICE 推进至 FINISHED，解锁用户评价入口）
// @param {Object} payload - { orderId }
export function finishService(payload) {
  return callCloud('orders-finish-service', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 标记爽约（将 BOOKED 且已超时的订单标记为 NO_SHOW，可附带原因）
// @param {Object} payload - { orderId, reason? }
export function markNoShow(payload) {
  return callCloud('orders-no-show', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 删除订单（仅允许对 CANCELLED 或 FINISHED 状态的订单执行，操作不可逆）
// @param {Object} payload - { orderId }
export function deleteOrder(payload) {
  return callCloud('orders-delete', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 理发师订单列表（理发师端，按日期查询当天所有状态订单）
// 支持 lastSyncAt 增量同步，适用于理发师从后台切回前台时快速刷新。
// @param {Object} payload - { date, lastSyncAt? }
export function fetchBarberOrders(payload) {
  const key = `orders-barber-list:${payload && payload.date ? payload.date : ''}`;
  if (payload && payload.lastSyncAt) {
    return callCloud('orders-barber-list', payload).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-barber-list', payload).then(normalizeListResponse));
}

// 门店订单列表（管理员端，按日期查询全店所有理发师订单）
// @param {Object} payload - { date, lastSyncAt? }
export function fetchStoreOrders(payload) {
  const key = `orders-store-list:${payload && payload.date ? payload.date : ''}`;
  if (payload && payload.lastSyncAt) {
    return callCloud('orders-store-list', payload).then(normalizeListResponse);
  }
  return cachedCall(key, () => callCloud('orders-store-list', payload).then(normalizeListResponse));
}

// 创建评价（仅 FINISHED 状态订单可提交，同一订单只能评价一次）
// 成功后同时清理评价缓存与门店缓存（门店评分会实时更新）
// @param {Object} payload - { orderId, rating: { overall, service?, skill? }, content, images? }
export function createReview(payload) {
  return callCloud('reviews-create', payload).then((data) => {
    clearOrderCaches();
    clearReviewCaches();
    return data;
  });
}

// 按订单 ID 查询评价（用于订单详情页展示"我的评价"区域）
// @param {Object} payload - { orderId }
export function fetchReviewByOrder(payload) {
  const key = `reviews-by-order:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('reviews-by-order', payload), REVIEW_TTL);
}

// 获取我的评价列表（用户端"我的评价"页，分页展示）
// @param {Object} params - { page?, pageSize? }
export function fetchMyReviews(params = {}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const key = `reviews-mine:${page}:${pageSize}`;
  return cachedCall(key, () => callCloud('reviews-mine', params), REVIEW_MINE_TTL);
}

// 删除我的评价（软删除，门店评分会随之更新）
// @param {Object} payload - { reviewId }
export function deleteReview(payload) {
  return callCloud('reviews-delete', payload).then((data) => {
    clearReviewCaches();
    return data;
  });
}

// 获取订单明细项（服务内容拆分，如剪发 + 造型各一行；创建后固定，10 分钟缓存安全）
// @param {Object} payload - { orderId }
export function fetchOrderItems(payload) {
  const key = `order-items:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('orders-items-list', payload), ITEM_TTL);
}

// 获取订单事件日志（状态流转记录，如"创建→到店→完成"时序；日志只增不改，10 分钟缓存安全）
// @param {Object} payload - { orderId }
export function fetchOrderEvents(payload) {
  const key = `order-events:${payload && payload.orderId ? payload.orderId : ''}`;
  return cachedCall(key, () => callCloud('orders-events-list', payload), EVENT_TTL);
}

// 提交售后申请（仅 FINISHED 状态可发起，一个订单允许多次申请）
// @param {Object} payload - { orderId, type: 'SERVICE'|'NO_SHOW'|'OTHER', content }
export function createAftersale(payload) {
  return callCloud('aftersales-create', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}

// 门店售后列表（管理员端，查询本店全部售后申请）
// 不走缓存：售后状态变化频繁（OPEN→PROCESSING→RESOLVED/REJECTED），需保证列表实时性。
// @param {Object} payload - { status? }
export function fetchAftersales(payload) {
  // 售后管理需要实时状态，避免本地缓存造成“全部/处理中/已解决”视图滞后
  return callCloud('aftersales-store-list', payload);
}

// 用户售后列表（用户端，查询自己提交的全部售后申请）
// 不走缓存：售后状态可能实时变化，需保证用户看到最新处理进度。
// @param {Object} payload - { page?, pageSize? }
export function fetchMyAftersales(payload) {
  return callCloud('aftersales-mine-list', payload || {});
}

// 管理员处理售后（更新状态并填写回复内容）
// @param {Object} payload - { id, reply, status: 'PROCESSING'|'RESOLVED'|'REJECTED' }
export function replyAftersale(payload) {
  return callCloud('aftersales-reply', payload).then((data) => {
    clearOrderCaches();
    return data;
  });
}
