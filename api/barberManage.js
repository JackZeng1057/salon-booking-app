/**
 * @file api/barberManage.js — 理发师账号管理前端 API 封装
 *
 * 【职责定位】
 * 封装管理员对本店理发师账号进行日常运营操作的 callCloud 调用，
 * 供管理后台"理发师管理"页（pages/admin/barbers/）使用。
 *
 * 【支持的操作】
 *   - list   ：查询当前门店下所有已审核理发师账号列表
 *   - rename ：修改指定理发师的显示名称（username 字段）
 *   - remove ：将理发师从本店移除（role 回退为 user，storeId 清空）
 *
 * 【单一云函数多动作模式（Action Dispatch 设计）】
 * 三种操作均指向同一 barbers-manage 云函数，通过 action 字段区分行为分支。
 * 优点：减少云函数数量，降低冷启动总次数，适合低频的管理员账号维护操作；
 * 缺点：单函数体积略大，需在云函数内做完整的权限校验分发。
 */
import { callCloud } from './client';

/**
 * 获取当前门店的理发师账号列表
 * @returns {Promise<Array>} 理发师对象数组（含 _id / username / approvalStatus 等字段）
 */
export function fetchManagedBarbers() {
  return callCloud('barbers-manage', { action: 'list' }).then((data) => (data && data.list) || []);
}

/**
 * 修改理发师显示名称
 * @param {string} barberId  - 目标理发师用户 _id
 * @param {string} username  - 新的显示名称（1-30 字，由云函数侧校验）
 * @returns {Promise} 操作结果
 */
export function renameManagedBarber(barberId, username) {
  return callCloud('barbers-manage', {
    action: 'rename',
    barberId,
    username
  });
}

/**
 * 从本店移除理发师账号
 * 执行后该账号 role 回退为 user，不再出现在门店理发师列表中。
 * @param {string} barberId - 目标理发师用户 _id
 * @returns {Promise} 操作结果
 */
export function removeManagedBarber(barberId) {
  return callCloud('barbers-manage', {
    action: 'remove',
    barberId
  });
}

