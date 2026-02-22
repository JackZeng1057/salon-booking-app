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
