/**
 * @file orders-reschedule/index.js — 改期云函数
 *
 * 【业务定位】
 * 允许 user（顾客）或 admin（管理员）将一个 BOOKED 订单迁移到新日期/时间，
 * 同时完成"旧时段释放 + 新时段锁定"的原子性置换。
 *
 * 【可改期条件】
 * - 订单状态必须为 BOOKED；
 * - 距当前预约开始时间必须 > 5 分钟（reschedule_window_expired 保护），
 *   避免在服务即将开始时来不及响应的情况下改期。
 *
 * 【改期流程（6 步）】
 *   1. 权限 & 参数校验（确认 user/admin 只能操作自己权限内的订单）
 *   2. 新时段参数校验（日期格式、时间对齐、排班区间、营业时间、预约截止窗口）
 *   3. 创建新 time_slots 文档（ensureSlotDocsExist）
 *   4. 锁定新时段（lockSlotTimesForOrder — 乐观锁，失败则抛出 slot_conflict）
 *   5. 释放旧时段（将旧 time_slots 恢复 AVAILABLE + orderId 清空）
 *   6. 更新 orders 文档（写入新 date/startTime/endTime）
 *
 * 【失败通知机制（防重复）】
 * 改期失败时通过 hasRecentRescheduleFailNotice() 做幂等检查：
 * 若 3 分钟内已发过相同失败通知，则跳过，避免用户收到重复推送。
 *
 * 【错误映射（mapRescheduleFailMessage）】
 * 将内部错误码（slot_conflict / outside_schedule 等）转换为中文提示，
 * 通过通知推送给顾客，提升改期失败时的用户体验。
 *
 * 【通知策略（Fire-and-Forget）】
 * notifyRescheduleStakeholders() 通知顾客/理发师/管理员三方，
 * 外层 catch 吞掉通知异常，不影响改期主流程返回。
 */
const {
  withResponse,
  ApiError,
  ERROR_CODES,
  requireRole,
  logAudit,
  logOrderEvent,
  isValidBookingDate,
  isValidBookingTime,
  timeToMinutes,
  minutesToTime,
  isAlignedToSlotStep,
  buildRequiredSlotStartTimes,
  ensureSlotTimesWithinSchedule,
  ensureSlotTimesWithinBusinessHours,
  ensureSlotDocsExist,
  lockSlotTimesForOrder
} = require('sb-common');

async function notifyRescheduleStakeholders(db, payload = {}) {
  const {
    orderId = '',
    storeId = '',
    barberId = '',
    userId = '',
    oldDate = '',
    oldStartTime = '',
    newDate = '',
    newStartTime = '',
    operatorId = ''
  } = payload;

  const oldText = `${oldDate} ${oldStartTime}`.trim();
  const newText = `${newDate} ${newStartTime}`.trim();

  // 通知下单用户本人
  if (userId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'reschedule',
        title: '订单改期成功',
        content: `您已将预约从 ${oldText} 改期到 ${newText}。`,
        relatedId: orderId
      }
    });
  }

  // 通知理发师
  if (barberId && barberId !== operatorId) {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: barberId,
        type: 'reschedule',
        title: '订单改期提醒',
        content: `顾客将预约从 ${oldText} 改期到 ${newText}。`,
        relatedId: orderId
      }
    });
  }

  // 通知门店管理员（同店多个管理员）
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
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: adminId,
        type: 'reschedule',
        title: '订单改期提醒',
        content: `门店预约已改期：${oldText} -> ${newText}。`,
        relatedId: orderId
      }
    });
  }
}

function mapRescheduleFailMessage(errorCode) {
  const map = {
    reschedule_window_expired: '距离开始不足5分钟，当前不可改期。',
    status_not_allowed: '当前订单状态不允许改期。',
    booking_window_closed: '目标时段距离开始不足5分钟，已停止预约。',
    time_expired: '目标时段已过期，请重新选择。',
    outside_schedule: '目标时段不在排班内，请更换时间。',
    outside_business_hours: '目标时段不在门店营业时间内，请更换时间。',
    slot_conflict: '目标时段已被占用，请重新选择。'
  };
  return map[errorCode] || '改期未成功，请稍后重试。';
}

async function hasRecentRescheduleFailNotice(db, userId, orderId, content, withinMin = 3) {
  if (!userId || !orderId || !content) return false;
  const now = Date.now();
  const res = await db
    .collection('notifications')
    .where({
      userId,
      type: 'reschedule',
      title: '订单改期失败',
      relatedId: orderId,
      content,
      createdAt: db.command.gte(now - withinMin * 60 * 1000)
    })
    .limit(1)
    .get();
  return !!(res && res.data && res.data.length > 0);
}

async function notifyRescheduleFailure(db, payload = {}) {
  const {
    userId = '',
    orderId = '',
    oldDate = '',
    oldStartTime = '',
    errorCode = ''
  } = payload;
  if (!userId || !orderId) return;

  const oldText = `${oldDate} ${oldStartTime}`.trim();
  const reason = mapRescheduleFailMessage(errorCode);
  const content = `您发起的 ${oldText} 改期失败。${reason}`;
  const duplicated = await hasRecentRescheduleFailNotice(db, userId, orderId, content);
  if (duplicated) return;

  await uniCloud.callFunction({
    name: 'notifications-create',
    data: {
      userId,
      type: 'reschedule',
      title: '订单改期失败',
      content,
      relatedId: orderId
    }
  });
}

// 订单改期主流程入口（仅 user 角色可调用）
// 改期策略：先占新时段，成功后再释放旧时段（"占新优先"），
// 保证在高并发场景下不出现新时段被抢占后旧单仍被释放的双输情况。
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 user 可改期
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const newDate = (event && event.newDate) || '';
  const newStartTime = (event && event.newStartTime) || '';

  if (!orderId || !newDate || !newStartTime) {
    throw new ApiError(400, 'orderId, newDate, newStartTime required');
  }
  if (!isValidBookingDate(newDate)) {
    throw new ApiError(400, 'invalid date format');
  }
  if (!isValidBookingTime(newStartTime)) {
    throw new ApiError(400, 'invalid time format');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  // 仅取改期校验所需字段，减少读取量（不拉 orderItems、顾客信息等）
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      status: true,
      barberId: true,
      storeId: true,
      serviceId: true,
      date: true,
      startTime: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 只能改期自己的订单
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 状态校验：仅 BOOKED 可改期
  if (order.status !== 'BOOKED') {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'status_not_allowed'
      });
    } catch (err) {
      console.error('notify reschedule failed(status) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  // 改期窗口：开始前 5 分钟截止
  const orderStartMs = new Date(`${order.date}T${order.startTime}:00+08:00`).getTime();
  if (orderStartMs && Date.now() >= orderStartMs - 5 * 60 * 1000) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'reschedule_window_expired'
      });
    } catch (err) {
      console.error('notify reschedule failed(window) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'reschedule_window_expired');
  }

  // 若改期到同一日期与时段，直接返回，避免无效写
  if (order.date === newDate && order.startTime === newStartTime) {
    return { order };
  }

  // 计算新的 endTime
  // 仅取时长字段用于计算 endTime
  const serviceRes = await db
    .collection('services')
    .doc(order.serviceId)
    .field({ duration: true, durationMin: true })
    .get();
  const service = serviceRes.data && serviceRes.data[0];
  const durationMin = Number((service && (service.duration || service.durationMin)) || 30);
  const startMin = timeToMinutes(newStartTime);
  if (Number.isNaN(startMin) || !isAlignedToSlotStep(startMin)) {
    throw new ApiError(400, 'invalid startTime');
  }
  // endTime 仅用于展示与订单快照，不参与 time_slots 锁定逻辑
  const newEndTime = minutesToTime(startMin + durationMin);

  const startMs = new Date(`${newDate}T${newStartTime}:00+08:00`).getTime();
  if (startMs && startMs <= Date.now() + 5 * 60 * 1000) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: 'booking_window_closed'
      });
    } catch (err) {
      console.error('notify reschedule failed(expired) error:', err);
    }
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'booking_window_closed');
  }

  const _ = db.command;
  // buildRequiredSlotStartTimes：根据 startTime + durationMin 拆分所需的 5 分钟时段列表
  const newSlotTimes = buildRequiredSlotStartTimes(newStartTime, durationMin);
  try {
    // 校验新时段在理发师排班区间内
    await ensureSlotTimesWithinSchedule(db, order.barberId, newDate, newSlotTimes);
    // 校验新时段在门店营业时间内
    await ensureSlotTimesWithinBusinessHours(db, order.storeId, newDate, newSlotTimes);
    // 确保 time_slots 文档存在（若未生成则自动创建 AVAILABLE 状态文档）
    await ensureSlotDocsExist(db, {
      storeId: order.storeId || '',
      barberId: order.barberId,
      date: newDate,
      slotTimes: newSlotTimes
    });
    // 乐观锁：将目标时段标记为 OCCUPIED 并写入 orderId；若已被占用则抛出 slot_conflict
    await lockSlotTimesForOrder(db, {
      barberId: order.barberId,
      date: newDate,
      slotTimes: newSlotTimes,
      orderId
    });
  } catch (err) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: err && err.message ? err.message : 'reschedule_failed'
      });
    } catch (notifyErr) {
      console.error('notify reschedule failed(slot) error:', notifyErr);
    }
    throw err;
  }

  const rescheduleFrom = `${order.date} ${order.startTime}`;

  const now = Date.now();
  try {
    // 更新订单时间
    await db.collection('orders').doc(orderId).update({
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      rescheduleFrom,
      updatedAt: now
    });

    const oldSlotTimes = buildRequiredSlotStartTimes(order.startTime, durationMin);
    // 释放旧时段：将旧 time_slots 恢复 AVAILABLE 并清空 orderId（在新时段锁定成功后才执行）
    await db
      .collection('time_slots')
      .where({ barberId: order.barberId, date: order.date, startTime: _.in(oldSlotTimes), orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: now
      });

    await logOrderEvent(db, {
      orderId,
      fromStatus: order.status,
      toStatus: order.status,
      opUserId: userId,
      role: 'user',
      ts: now,
      remark: `reschedule:${rescheduleFrom} -> ${newDate} ${newStartTime}`
    });

    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'reschedule',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    try {
      await notifyRescheduleFailure(db, {
        userId,
        orderId,
        oldDate: order.date || '',
        oldStartTime: order.startTime || '',
        errorCode: err && err.message ? err.message : 'reschedule_failed'
      });
    } catch (notifyErr) {
      console.error('notify reschedule failed(update) error:', notifyErr);
    }
    await logAudit(db, {
      actorId: userId,
      role: 'user',
      action: 'reschedule',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'reschedule_failed',
      requestId
    });
    throw err;
  }

  // 通知理发师与门店管理员（失败不影响主流程）
  try {
    await notifyRescheduleStakeholders(db, {
      orderId,
      storeId: order.storeId || '',
      barberId: order.barberId || '',
      userId,
      oldDate: order.date || '',
      oldStartTime: order.startTime || '',
      newDate,
      newStartTime,
      operatorId: userId
    });
  } catch (err) {
    console.error('notify reschedule stakeholders failed:', err);
  }

  // 直接拼装返回，避免二次读取
  return {
    order: {
      ...order,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      rescheduleFrom,
      updatedAt: now
    }
  };
});
