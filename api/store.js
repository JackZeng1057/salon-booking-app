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

// 获取门店列表（支持搜索、筛选、排序）
export function fetchStores(params = {}) {
  // 如果有搜索或筛选条件，不使用缓存
  const hasFilter = params.keyword || params.sortBy !== 'default' || 
                    params.minRating || params.maxDistance || params.maxPrice;
  
  if (!hasFilter) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const key = `stores-list:${page}:${pageSize}`;
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  
  return callCloud('stores-list', params).then((data) => {
    // 只缓存默认查询结果，避免筛选条件污染缓存
    if (!hasFilter) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 50;
      const key = `stores-list:${page}:${pageSize}`;
      setCache(key, data);
    }
    return data;
  });
}

// 获取门店详情
export function fetchStoreDetail(id) {
  const key = `stores-detail:${id}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('stores-detail', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}

// 获取门店服务列表
export function fetchStoreServices(id) {
  const key = `stores-services:${id}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('stores-services', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}

// 获取门店理发师列表
export function fetchStoreBarbers(id) {
  const key = `stores-barbers:${id}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('stores-barbers', { id }).then((data) => {
    setCache(key, data);
    return data;
  });
}
