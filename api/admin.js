/**
 * @file api/admin.js — 管理员后台前端 API 封装
 *
 * 【职责定位】
 * 封装管理员后台的 callCloud 调用，目前集中在门店运营看板数据的读取。
 * 后台其他操作（理发师审核、服务配置等）由各自专属模块封装：
 *   - api/barberApproval.js  → 理发师申请审核
 *   - api/barberManage.js   → 理发师账号维护（改名/移除）
 *   - api/store.js          → 门店资料编辑与服务项目配置
 *
 * 【缓存策略（DASHBOARD_TTL=2分钟）】
 * 看板数据（当日预约量、在服务数、完成率等）属于准实时统计，
 * 2 分钟的内存缓存既能避免管理员频繁切换日期时反复调用云函数，
 * 又能在手动刷新时快速拿到最新数据。
 * 缓存 key 按「mode + date」维度区分，
 * 日视图（day）与周视图（week）缓存互不干扰。
 */
import { callCloud } from './client';
import { getCache, setCache } from '../utils/cache';

const DASHBOARD_TTL = 2 * 60 * 1000; // 2 分钟

/**
 * 获取门店运营看板数据
 * @param {Object} payload - 查询参数
 * @param {string} payload.date        - 查询日期（YYYY-MM-DD）
 * @param {string} [payload.mode='day'] - 统计粒度：'day' 日视图 / 'week' 周视图
 * @returns {Promise} 含预约量/完成率等统计指标的看板数据对象
 */
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
