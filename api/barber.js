import { callCloud } from './client';
import { getCache, setCache, removeCacheByPrefix } from '../utils/cache';

// 理发师排班与时段接口封装：统一缓存与失效策略
// - 排班更新后清除所有时段缓存
// - 时段缓存按 barberId + date + serviceId 维度区分
const SLOT_TTL = 5 * 60 * 1000; // 5 分钟

// 设置理发师排班并生成时段
// 入参：{ date, workStart, workEnd }
export function setBarberSchedule(payload) {
  return callCloud('barber-schedule-set', payload).then((data) => {
    // 排班变更会影响该理发师所有日期时段，直接清理前缀缓存
    removeCacheByPrefix('barber-slots:');
    return data;
  });
}

// 查询理发师某天时段
// 入参：{ barberId, date, serviceId? }
export function fetchBarberSlots(payload) {
  const barberId = payload && payload.barberId ? payload.barberId : '';
  const date = payload && payload.date ? payload.date : '';
  const serviceId = payload && payload.serviceId ? payload.serviceId : '';
  // 同一天不同服务会有不同可预约窗口，缓存 key 需包含 serviceId
  const key = `barber-slots:${barberId}:${date}:${serviceId}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('barber-slots-get', payload).then((data) => {
    setCache(key, data, SLOT_TTL);
    return data;
  });
}
