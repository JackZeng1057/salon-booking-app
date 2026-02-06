// 管理端接口：门店运营看板
import { callCloud } from './client';
import { getCache, setCache } from '../utils/cache';

const DASHBOARD_TTL = 2 * 60 * 1000; // 2 分钟

// 门店运营看板
// 入参：{ date }
export function fetchDashboard(payload) {
  const date = payload && payload.date ? payload.date : '';
  const key = `admin-dashboard:${date}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return callCloud('admin-dashboard', payload).then((data) => {
    setCache(key, data, DASHBOARD_TTL);
    return data;
  });
}
