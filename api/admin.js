// 管理端接口：门店运营看板
import { callCloud } from './client';
import { getCache, setCache } from '../utils/cache';

const DASHBOARD_TTL = 2 * 60 * 1000; // 2 分钟

// 门店运营看板
// 入参：{ date, mode? } mode: day/week
export function fetchDashboard(payload) {
  const date = payload && payload.date ? payload.date : '';
  const mode = payload && payload.mode ? payload.mode : 'day';
  const key = `admin-dashboard:${mode}:${date}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('admin-dashboard', { ...(payload || {}), mode }).then((data) => {
    setCache(key, data, DASHBOARD_TTL);
    return data;
  });
}
