/**
 * @file api/barberApproval.js — 理发师申请审核前端 API 封装
 *
 * 【职责定位】
 * 封装管理员对理发师注册申请进行审核操作的 callCloud 调用，
 * 供管理后台"理发师审核"页（pages/admin/barber-approvals/）使用。
 *
 * 【业务背景】
 * 理发师注册时不会立即获得 barber 角色，而是以 user 身份写入，
 * 并附带 pendingRole='barber'、approvalStatus='PENDING'。
 * 管理员在审核页查看待处理申请列表，逐一执行通过或驳回操作：
 *   - 通过（approve）：云函数将 role 更新为 barber，approvalStatus='APPROVED'，
 *                      并自动通知该理发师审核结果；
 *   - 驳回（reject） ：approvalStatus='REJECTED'，附带驳回原因通知理发师。
 *
 * 【数据流来源】
 * fetchBarberApplications 调用 barber-applications-list 云函数，
 * 该云函数从 users 集合筛选 pendingRole='barber' 的记录，
 * 按创建时间降序分页返回，供管理员"待审核/已审核"双栏展示。
 */
import { callCloud } from './client';

/**
 * 获取理发师申请列表（管理员视角）
 * @param {Object} [payload]           - 查询参数
 * @param {string} [payload.status]    - 筛选状态：'PENDING' | 'APPROVED' | 'REJECTED'
 * @param {number} [payload.page]      - 当前页码，默认 1
 * @param {number} [payload.pageSize]  - 每页条数，默认 20
 * @returns {Promise} 申请记录列表，每条含用户基本信息与申请状态
 */
export function fetchBarberApplications(payload = {}) {
  return callCloud('barber-applications-list', payload);
}

/**
 * 审核理发师申请（通过或驳回）
 * @param {Object} payload            - 操作参数
 * @param {string} payload.userId     - 被审核理发师的账号 _id
 * @param {string} payload.action     - 操作类型：'approve'（通过） | 'reject'（驳回）
 * @param {string} [payload.reason]   - 驳回原因，action='reject' 时建议填写
 * @returns {Promise} 操作结果
 */
export function reviewBarberApplication(payload = {}) {
  return callCloud('barber-application-review', payload);
}
