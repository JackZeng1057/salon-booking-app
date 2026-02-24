/**
 * @file orders-cancel/index.js — 取消预约云函数
 *
 * 【业务定位】
 * 实现订单状态机中 BOOKED → CANCELLED 这一关键转换。
 * 两类角色可触发取消：
 *   - user（顾客自主取消）：只能取消自己的订单；
 *   - admin（门店代取消）：只能取消本店订单，需附加原因（reason 参数）。
 *
 * 【取消时间窗口设计】
 * 允许在预约开始时刻 + cancelWindowMin（默认 5 分钟）以内取消。
 * 宽限几分钟的原因：顾客到店核验与取消操作在极端情况下可能交叉发生，
 * 若到店后立即关闭取消入口，则管理员需手动回滚，故保留短暂宽限期。
 *
 * 【并发安全（乐观锁）】
 * update 操作的 where 条件包含 status=BOOKED，保证"只有 BOOKED 才能被取消"，
 * 避免两路并发请求都成功取消同一订单。
 * 若 updateRes.updated === 0，则说明已被他人修改，返回 status_not_allowed。
 *
 * 【slot 释放】
 * 取消成功后立即将对应 time_slots 恢复为 AVAILABLE，
 * 确保其他用户可以立刻预约该时段，最大化门店运营效率。
 *
 * 【通知策略（Fire-and-Forget）】
 * notifyCancelStakeholders() 封装了顾客/理发师/管理员三方通知，
 * 外层 try/catch 吞掉通知异常，保证主流程成功后不会因通知失败报错给前端。
 */
const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 历史数据兼容：旧订单状态可能存中文，统一映射为英文枚举以便后续状态机判断。
function normalizeStatus(status) {
  const map = {
    已预约: 'BOOKED',
    已到店: 'ARRIVED',
    服务中: 'IN_SERVICE',
    已完成: 'FINISHED',
    已取消: 'CANCELLED',
    爽约: 'NO_SHOW'
  };
  return map[status] || status;
}

// 把“预约日期 + 开始时间”按中国时区转换成时间戳（毫秒）。
// 传入非法值时返回 0，上层按“可取消”兜底，不让解析问题误伤用户操作。
function toChinaTimestamp(date, time) {
  if (!date || !time) return 0;
  const ms = new Date(`${date}T${time}:00+08:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// 取消窗口判断：
// - 开始前允许取消；
// - 开始后在 cancelWindowMin 分钟内仍允许取消（避免到店操作与取消操作短时冲突）。
function inCancelWindow(order, now, cancelWindowMin) {
  const startMs = toChinaTimestamp(order.date, order.startTime);
  if (!startMs) return true;
  return now <= startMs + cancelWindowMin * 60 * 1000;
}

// 取消后通知相关方（顾客/理发师/门店管理员）。
// 说明：通知失败不应影响主事务，因此由调用方在外层吞错。
async function notifyCancelStakeholders(db, payload = {}) {
  const {
    orderId = '',
    storeId = '',
    barberId = '',
    userId = '',
    date = '',
    startTime = '',
    reason = '',
    operatorId = '',
    operatorRole = 'user'
  } = payload;

  const reasonText = reason ? `，原因：${reason}` : '';
  const timeText = `${date} ${startTime}`.trim();

  // 通知顾客：区分“门店代取消”和“用户自行取消”的文案。
  if (userId) {
    const content = operatorRole === 'admin'
      ? `门店已取消您 ${timeText} 的预约${reasonText}。`
      : `您已取消 ${timeText} 的预约${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'cancel',
        title: '订单已取消',
        content,
        relatedId: orderId
      }
    });
  }

  // 通知理发师
  // 若理发师就是操作人（如理发师端取消），则跳过避免收到自己触发的提醒。
  if (barberId && barberId !== operatorId) {
    const content = operatorRole === 'admin'
      ? `门店已取消 ${timeText} 的预约${reasonText}。`
      : `顾客已取消 ${timeText} 的预约${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: barberId,
        type: 'cancel',
        title: '订单取消提醒',
        content,
        relatedId: orderId
      }
    });
  }

  // 通知门店管理员：店内其他管理员需要同步取消状态，便于前台协同。
  if (!storeId) return;
  const adminRes = await db
    .collection('users')
    .where({ role: 'admin', storeId })
    .field({ _id: true })
    .get();

  const admins = adminRes.data || [];
  for (let i = 0; i < admins.length; i += 1) {
    const adminId = (admins[i] && admins[i]._id) || '';
    if (!adminId || adminId === operatorId) continue;

    const content = operatorRole === 'admin'
      ? `门店预约 ${timeText} 已取消${reasonText}。`
      : `门店预约 ${timeText} 已被顾客取消${reasonText}。`;

    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: adminId,
        type: 'cancel',
        title: '订单取消提醒',
        content,
        relatedId: orderId
      }
    });
  }
}

// 取消预约：仅 BOOKED 可取消；顾客和门店都可以取消
// 时间窗口：开始后 5 分钟内可取消（含开始前）
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  const actor = await requireRole(['user', 'admin'], event, context);

  const orderId = (event && event.orderId) || '';
  const reason = (event && event.reason) || '';
  // 允许前端配置窗口（默认 5 分钟），并做非负保护。
  const cancelWindowMin = Math.max(Number((event && event.cancelWindowMin) || 5), 0);

  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const actorId = actor._id || actor.uid || actor.userId;
  const actorRole = actor.role || 'user';
  const db = uniCloud.database();
  const _ = db.command;

  // 读取订单最小字段集：只取取消判断与通知所需字段，减少读放大。
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true,
      status: true,
      barberId: true,
      date: true,
      startTime: true,
      endTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 权限控制：
  // - user 只能取消自己的订单；
  // - admin 只能取消自己门店的订单。
  if (actorRole === 'user' && order.userId !== actorId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (actorRole === 'admin' && actor.storeId && order.storeId !== actor.storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const normalizedStatus = normalizeStatus(order.status);

  // 幂等：已取消直接返回
  if (normalizedStatus === 'CANCELLED') {
    return {
      order: {
        ...order,
        status: 'CANCELLED'
      }
    };
  }

  if (normalizedStatus !== 'BOOKED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  // 超过可取消时间窗口直接拒绝，避免服务已开始太久后仍撤单。
  const now = Date.now();
  if (!inCancelWindow(order, now, cancelWindowMin)) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'cancel_window_expired');
  }

  try {
    // 并发保护：where 条件包含状态，确保只有 BOOKED 状态可转 CANCELLED。
    const updateRes = await db
      .collection('orders')
      .where({ _id: orderId, status: _.in(['BOOKED', '已预约']) })
      .update({
        status: 'CANCELLED',
        cancelReason: reason || '',
        updatedAt: now
      });

    if (!updateRes || updateRes.updated <= 0) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
    }

    // 释放对应时段占用，恢复为可预约。
    await db
      .collection('time_slots')
      .where({ barberId: order.barberId, date: order.date, orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: now
      });

    await logOrderEvent(db, {
      orderId,
      fromStatus: 'BOOKED',
      toStatus: 'CANCELLED',
      opUserId: actorId,
      role: actorRole,
      ts: now,
      remark: reason || `${actorRole}_cancel`
    });

    await logAudit(db, {
      actorId,
      role: actorRole,
      action: 'cancel',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    // 主事务异常时记录审计日志，便于回溯谁在何时取消失败。
    await logAudit(db, {
      actorId,
      role: actorRole,
      action: 'cancel',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'cancel_failed',
      requestId
    });
    throw err;
  }

  try {
    // 通知属于“附加流程”，失败仅记录日志，不影响取消结果返回。
    await notifyCancelStakeholders(db, {
      orderId,
      storeId: order.storeId || '',
      barberId: order.barberId || '',
      userId: order.userId || '',
      date: order.date || '',
      startTime: order.startTime || '',
      reason: reason || '',
      operatorId: actorId,
      operatorRole: actorRole
    });
  } catch (err) {
    console.error('notify cancel stakeholders failed:', err);
  }

  return {
    order: {
      ...order,
      status: 'CANCELLED',
      cancelReason: reason || '',
      updatedAt: now
    }
  };
});
