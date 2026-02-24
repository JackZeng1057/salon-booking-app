/**
 * @file utils/cache.js — 前端本地内存缓存工具
 *
 * 【职责定位】
 * 对 uni.getStorageSync / uni.setStorageSync 做一层封装，
 * 增加 TTL（过期时间）管理和前缀批量清理能力，
 * 供 api/order.js / api/barber.js 等业务模块使用。
 *
 * 【设计说明】
 * uni.getStorageSync 是 uni-app 提供的同步本地存储 API，底层依赖平台：
 *   - App（Android/iOS）→ SQLite
 *   - H5 → localStorage
 * 相比每次都发起 callCloud 网络请求，本地缓存可大幅减少云函数调用次数，
 * 降低 uniCloud 资源配额消耗，提升页面加载速度。
 *
 * 【缓存数据结构】
 * Storage 中每条记录的结构为：
 *   { value: <业务数据>, time: <写入时间戳>, ttl: <有效毫秒> }
 * getCache() 自动检查 Date.now() - time > ttl，过期返回 null（主动失效）。
 *
 * 【前缀批量清理（removeCacheByPrefix）】
 * 根据 uni.getStorageInfoSync().keys 枚举所有缓存 key，
 * 删除指定前缀的所有条目，用于状态变更后的批量失效：
 *   如取消订单后调用 removeCacheByPrefix('orders-mine:') 清理所有分页缓存。
 *
 * 【TTL 粒度参考】
 * - 订单列表: 5 分钟（LIST_TTL = 5 * 60 * 1000）
 * - 订单详情: 2 分钟（DETAIL_TTL = 2 * 60 * 1000）
 * - 时段列表: 5 分钟（SLOT_TTL  = 5 * 60 * 1000）
 * - 评价/明细/日志: 10 分钟
 */
// 本地缓存工具：支持有效期与前缀清理
const DEFAULT_TTL = 60 * 1000; // 60秒

// 读取缓存：
// - 数据结构要求 { value, time, ttl }；
// - 过期或结构非法时返回 null，让业务方按未命中处理。
export function getCache(key) {
  const data = uni.getStorageSync(key);
  if (!data || typeof data !== 'object') return null;
  if (!data.time || !data.value) return null;
  const ttl = Number(data.ttl || DEFAULT_TTL);
  if (Date.now() - data.time > ttl) return null;
  return data.value;
}

// 写入缓存：默认 TTL 60 秒，可由调用方按场景覆盖。
export function setCache(key, value, ttl = DEFAULT_TTL) {
  uni.setStorageSync(key, { value, time: Date.now(), ttl });
}

// 按 key 前缀批量清理缓存：
// 常用于登录态切换、订单列表状态切换后的失效处理。
export function removeCacheByPrefix(prefix) {
  try {
    const info = uni.getStorageInfoSync();
    const keys = (info && info.keys) || [];
    keys.forEach((key) => {
      if (key.startsWith(prefix)) {
        uni.removeStorageSync(key);
      }
    });
  } catch (e) {
    // 忽略读取缓存列表的异常
  }
}
