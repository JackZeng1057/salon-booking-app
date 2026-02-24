/**
 * @file api/barber.js — 理发师排班与时段前端 API 封装
 *
 * 【职责定位】
 * 封装理发师排班管理和时段查询的 callCloud 调用，
 * 供排班设置页（pages/barber/schedule/）和预约创建页（pages/order/create.vue）使用。
 *
 * 【时段缓存设计（SLOT_TTL=5分钟）】
 * 理发师时段数据读取频率高（预约页每次切换理发师/日期都会请求），
 * 内存缓存避免同页面内重复请求，5 分钟的 TTL 兼顾实时性与性能。
 * 缓存 key 格式：barber-slots:<barberId>:<date>:<serviceId>
 * 包含 serviceId 的原因：同一时间段对不同服务时长的可约窗口不同，
 * 必须按服务维度分别缓存。
 *
 * 【排班变更触发缓存清理】
 * setBarberSchedule() 成功后调用 removeCacheByPrefix('barber-slots:')，
 * 清理当前理发师所有日期的时段缓存，
 * 防止排班更新后前端仍展示旧的可预约窗口。
 */
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
  const noCache = !!(payload && payload.noCache);
  const request = { ...(payload || {}) };
  delete request.noCache;
  const barberId = request && request.barberId ? request.barberId : '';
  const date = request && request.date ? request.date : '';
  const serviceId = request && request.serviceId ? request.serviceId : '';
  // 同一天不同服务会有不同可预约窗口，缓存 key 需包含 serviceId
  const key = `barber-slots:${barberId}:${date}:${serviceId}`;
  if (!noCache) {
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  }
  return callCloud('barber-slots-get', request).then((data) => {
    setCache(key, data, SLOT_TTL);
    return data;
  });
}
