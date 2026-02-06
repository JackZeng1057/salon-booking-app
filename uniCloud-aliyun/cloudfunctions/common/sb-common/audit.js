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
