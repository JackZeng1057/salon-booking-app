/**
 * @file api/store.js — 门店相关前端 API 封装
 *
 * 【职责定位】
 * 封装门店相关的 callCloud 调用，供门店列表页、详情页、管理后台使用。
 *
 * 【缓存策略（本地 uni.getStorageSync）】
 * 与 api/order.js 使用内存缓存（utils/cache.js）不同，
 * 门店数据使用 uni.Storage（落地到 App 本地 SQLite），
 * 原因是门店基础信息（名称/地址/营业时间）变化频率极低，
 * 本地持久化缓存可以在 App 冷启动后无网络时仍展示上次数据。
 * 缓存有效期 CACHE_TTL=24 小时，管理员更新门店资料后主动清理。
 *
 * 【搜索/筛选场景不缓存】
 * fetchStores() 在有 keyword/sortBy/minRating 等筛选条件时跳过缓存，
 * 防止筛选结果污染默认列表缓存，保证两种场景数据互不干扰。
 *
 * 【缓存清理联动】
 * updateManagedStore() 和 setStoreBarberServices() 成功后
 * 调用 clearStoreCache()，同时清理 stores-detail / stores-services /
 * stores-barbers / stores-list 多个缓存 key，
 * 保证管理员更新资料后其他用户下次进入门店页看到最新数据。
 */
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

// 获取门店详情（名称/地址/标签/营业时间/预约规则等完整信息）
// 使用 uni.Storage 落地持久化缓存，App 冷启动无网络时也能展示上次数据。
// @param {string} id                    - 门店 _id
// @param {Object} [options]
// @param {boolean} [options.noCache]    - 传 true 强制绕过缓存，适用于管理员编辑后刷新
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

// 获取门店服务列表（含价格/时长/是否可预约等字段）
// @param {string} id                    - 门店 _id
// @param {Object} [options]
// @param {boolean} [options.noCache]    - 传 true 强制绕过缓存
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

// 获取门店理发师列表（含 username / serviceIds / approvalStatus 等字段）
// 理发师信息变化较频繁，建议传 noCache:true 以获取最新可服务状态。
// @param {string} id                    - 门店 _id
// @param {Object} [options]
// @param {boolean} [options.noCache]    - 传 true 强制绕过缓存
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

// 管理员更新自己门店资料（地址/标签/营业时间/预约规则等）
// 成功后调用 clearStoreCache() 同时清理 detail/services/barbers/list 多个缓存 key，
// 保证其他用户下次进入门店页看到最新资料。
// @param {Object} payload - { storeId?, name?, address?, tags?, businessHours?, bookingRules? }
export function updateManagedStore(payload) {
  return callCloud('store-update-profile', payload || {}).then((data) => {
    const storeId = (data && data.storeId) || (payload && payload.storeId) || '';
    clearStoreCache(storeId);
    return data;
  });
}

// 管理员批量设置理发师可执行的服务项目（barber-services-set 云函数）
// assignments: [{ barberId, serviceIds[] }] 每条描述一个理发师的服务能力
// overwriteAll=true（默认）：全量覆盖该门店所有理发师配置，清除不在本次列表中的旧数据
// 成功后清理门店相关缓存，保证预约页下次加载能拿到更新后的可选理发师列表。
// @param {Array}  assignments          - 理发师-服务映射数组
// @param {Object} [options]
// @param {boolean} [options.overwriteAll=true] - 是否全量覆盖（false=仅更新传入的理发师，其余保留）
export function setStoreBarberServices(assignments, options = {}) {
  const payload = {
    assignments: Array.isArray(assignments) ? assignments : [],
    overwriteAll: options.overwriteAll !== false
  };
  return callCloud('barber-services-set', payload).then((data) => {
    const storeId = (data && data.storeId) || '';
    clearStoreCache(storeId);
    return data;
  });
}
