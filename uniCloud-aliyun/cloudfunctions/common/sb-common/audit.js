/**
 * @file audit.js — 审计与订单事件日志工具
 *
 * 【职责定位】
 * 提供两类日志写入能力，用于记录系统操作历史：
 *
 *   logAudit()      → 写入 audit_logs 集合
 *     记录"谁（actorId/role）在何时对哪个订单执行了什么操作（action）并得到什么结果"，
 *     用于安全审计、后台排查、客服核对。
 *
 *   logOrderEvent() → 写入 order_events 集合
 *     记录订单状态机的每一次流转（fromStatus → toStatus），
 *     用于离线分析、时间线展示、争议仲裁。
 *
 * 【设计原则：失败静默】
 * 两个函数内部均用 try/catch 包裹，写入失败时只打印错误不抛出，
 * 确保任何情况下主业务流程不会因审计日志失败而中断。
 * 这保证了系统的核心可用性 > 审计完整性。
 *
 * 【audit_logs 字段说明】
 * - actorId   : 操作者 _id（system 表示系统自动触发）
 * - role      : 操作者角色（user/barber/admin/system）
 * - action    : 操作类型（create/cancel/verify/reschedule/finish/auto_no_show …）
 * - orderId   : 关联订单 _id
 * - time      : 操作时间戳（毫秒）
 * - result    : 'success' | 'failed'
 * - message   : 失败原因（success 时为空字符串）
 * - requestId : 请求链路 ID，用于关联 withResponse 中的 requestId 排查日志
 *
 * 【order_events 字段说明】
 * - orderId      : 关联订单 _id
 * - fromStatus   : 流转前的状态
 * - toStatus     : 流转后的状态
 * - opUserId     : 操作者 _id
 * - role         : 操作者角色
 * - ts           : 事件时间戳（毫秒）
 * - remark       : 备注（如 'create'/'cancel'/'verify'/'auto_no_show_timeout' …）
 */

// 审计与订单事件日志：失败不影响主流程
async function logAudit(db, payload = {}) {
  try {
    await db.collection('audit_logs').add({
      actorId: payload.actorId || '',
      role: payload.role || '',
      action: payload.action || '',
      orderId: payload.orderId || '',
      time: payload.time || Date.now(),
      result: payload.result || 'success',
      message: payload.message || '',
      requestId: payload.requestId || ''
    });
  } catch (err) {
    // 审计日志失败不影响主流程
  }
}

async function logOrderEvent(db, payload = {}) {
  try {
    await db.collection('order_events').add({
      orderId: payload.orderId || '',
      fromStatus: payload.fromStatus || '',
      toStatus: payload.toStatus || '',
      opUserId: payload.opUserId || '',
      role: payload.role || '',
      ts: payload.ts || Date.now(),
      remark: payload.remark || ''
    });
  } catch (err) {
    // 日志失败不影响主流程
  }
}

module.exports = {
  logAudit,
  logOrderEvent
};
