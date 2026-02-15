// 门店相关接口：列表、详情、服务与理发师
import { callCloud } from './client';

// 缓存有效期（24小时）
const CACHE_TTL = 24 * 60 * 60 * 1000;

// 读取缓存
function getCache(key) {
  const data = uni.getStorageSync(key);
  if (!data || !data.value || !data.time) return null;
  if (Date.now() - data.time > CACHE_TTL) return null;
  return data.value;
}

// 写入缓存
function setCache(key, value) {
  uni.setStorageSync(key, { value, time: Date.now() });
}

// 删除单个缓存
function removeCache(key) {
  try {
    uni.removeStorageSync(key);
  } catch (e) {
    // ignore cache remove error
  }
}

// 按前缀清理缓存
function removeCacheByPrefix(prefix) {
  try {
    const info = uni.getStorageInfoSync();
    const keys = (info && info.keys) || [];
    keys.forEach((key) => {
      if (String(key).startsWith(prefix)) {
        removeCache(key);
      }
    });
  } catch (e) {
    // ignore cache clean error
  }
}

// 清理门店相关缓存（详情/服务/理发师/列表）
function clearStoreCache(storeId = '') {
  if (storeId) {
    removeCache(`stores-detail:${storeId}`);
    removeCache(`stores-services:${storeId}`);
    removeCache(`stores-barbers:${storeId}`);
  }
  removeCacheByPrefix('stores-list:');
}

// 获取门店列表（支持搜索、筛选、排序）
export function fetchStores(params = {}) {
  const noCache = !!params.noCache;
  const payload = { ...(params || {}) };
  delete payload.noCache;
  // 如果有搜索或筛选条件，不使用缓存
  const hasFilter = payload.keyword || payload.sortBy !== 'default' ||
                    payload.minRating || payload.maxDistance || payload.maxPrice;
  
  if (!noCache && !hasFilter) {
    const page = payload.page || 1;
    const pageSize = payload.pageSize || 50;
    const key = `stores-list:${page}:${pageSize}`;
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  
  return callCloud('stores-list', payload).then((data) => {
    // 只缓存默认查询结果，避免筛选条件污染缓存
    if (!noCache && !hasFilter) {
      const page = payload.page || 1;
      const pageSize = payload.pageSize || 50;
      const key = `stores-list:${page}:${pageSize}`;
      setCache(key, data);
    }
    return data;
  });
}

// 获取门店详情
export function fetchStoreDetail(id, options = {}) {
  const noCache = !!(options && options.noCache);
  const key = `stores-detail:${id}`;
  if (!noCache) {
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  return callCloud('stores-detail', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}

// 获取门店服务列表
export function fetchStoreServices(id, options = {}) {
  const noCache = !!(options && options.noCache);
  const key = `stores-services:${id}`;
  if (!noCache) {
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  return callCloud('stores-services', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}

// 获取门店理发师列表
export function fetchStoreBarbers(id, options = {}) {
  const noCache = !!(options && options.noCache);
  const key = `stores-barbers:${id}`;
  if (!noCache) {
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  return callCloud('stores-barbers', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}

// 管理员更新自己门店资料（地址/标签/营业时间/规则等）
export function updateManagedStore(payload) {
  return callCloud('store-update-profile', payload || {}).then((data) => {
    const storeId = (data && data.storeId) || (payload && payload.storeId) || '';
    clearStoreCache(storeId);
    return data;
  });
}

// 供页面在特殊场景主动清理缓存
export function invalidateStoreCache(storeId) {
  clearStoreCache(storeId || '');
}
