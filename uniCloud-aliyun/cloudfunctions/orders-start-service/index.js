/**
 * @file orders-start-service/index.js — 开始服务云函数
 *
 * 【业务定位】
 * 实现订单状态机中 ARRIVED → IN_SERVICE 这一关键转换，
 * 标志着顾客到店后理发师正式开始提供服务。
 * 触发时机：理发师或管理员在订单详情页点击「开始服务」按钮后调用。
 *
 * 【完整状态机路径（本函数负责第三步）】
 * BOOKED（已预约）
 *   → ARRIVED（到店核验）    由 orders-verify 触发
 *   → IN_SERVICE（服务中）   由本函数触发       ← 此处
 *   → FINISHED（已完成）     由 orders-finish-service 触发
 *
 * 【权限设计（双角色）】
 * - barber（理发师）：只能对自己负责的订单（barberId 匹配）触发开始服务；
 * - admin（管理员）：可对本店任意订单（storeId 匹配）触发，
 *   用于理发师无法操作时的兜底处理。
 *
 * 【幂等性保护】
 * 若订单已处于 IN_SERVICE 状态（如用户重复提交），
 * 直接返回当前状态而不报错，避免前端因网络重试收到误导性错误提示。
 *
 * 【前置状态要求（状态机保护）】
 * 仅允许 ARRIVED → IN_SERVICE，拒绝任何跨状态跳转（如 BOOKED→IN_SERVICE），
 * 从架构上保证服务流程严格有序，审计日志与实际操作完全对应。
 *
 * 【字段投影优化】
 * 读取订单时只投影 status / barberId / storeId / arrivedAt / verifiedBy，
 * 减少无效字段传输，降低云数据库读操作开销。
 */
const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 开始服务（ARRIVED -> IN_SERVICE）
// 说明：该操作是订单核心状态流转节点，必须严格校验权限与前置状态。
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const operator = await requireRole(['barber', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  // 只读取状态流转和权限判断所需字段，避免无用字段带来额外读负担。
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      status: true,
      barberId: true,
      storeId: true,
      arrivedAt: true,
      verifiedBy: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 权限：barber 只能处理自己的订单；admin 只能处理本店订单
  const role = operator.role || operator.type || '';
  if (role === 'barber' && order.barberId !== (operator._id || operator.uid || operator.userId)) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (role === 'admin' && operator.storeId && order.storeId !== operator.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const now = Date.now();
  // 幂等：重复点击“开始服务”时直接返回当前状态，避免重复写库。
  if (order.status === 'IN_SERVICE') {
    return { order };
  }

  const operatorId = operator._id || operator.uid || operator.userId;
  const nowTs = now;
  try {
    // 状态机保护：只有 ARRIVED 才允许转 IN_SERVICE，禁止跨状态跳转。
    if (order.status !== 'ARRIVED') {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
    }

    // 更新订单状态并记录服务开始时间。
    await db.collection('orders').doc(orderId).update({
      status: 'IN_SERVICE',
      inServiceAt: nowTs,
      updatedAt: nowTs
    });

    // 写订单事件日志：用于订单时间线展示与审计追踪。
    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: 'IN_SERVICE',
      opUserId: operatorId,
      role,
      ts: nowTs,
      remark: 'start_service'
    });

    // 写审计日志：用于后台追踪谁在何时触发了状态切换。
    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'start',
      orderId,
      time: nowTs,
      result: 'success',
      requestId
    });

    // 返回合并后的最新状态，减少前端再次查询。
    return {
      order: {
        ...order,
        status: 'IN_SERVICE',
        inServiceAt: nowTs,
        updatedAt: nowTs
      }
    };
  } catch (err) {
    // 失败同样落审计日志，便于排查权限或状态异常。
    await logAudit(db, {
      actorId: operatorId,
      role,
      action: 'start',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'start_failed',
      requestId
    });
    throw err;
  }
});
