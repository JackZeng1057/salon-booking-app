// 本地缓存工具：支持有效期与前缀清理
const DEFAULT_TTL = 60 * 1000; // 60秒

export function getCache(key) {
  const data = uni.getStorageSync(key);
  if (!data || typeof data !== 'object') return null;
  if (!data.time || !data.value) return null;
  const ttl = Number(data.ttl || DEFAULT_TTL);
  if (Date.now() - data.time > ttl) return null;
  return data.value;
}

export function setCache(key, value, ttl = DEFAULT_TTL) {
  uni.setStorageSync(key, { value, time: Date.now(), ttl });
}

export function removeCache(key) {
  uni.removeStorageSync(key);
}

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
