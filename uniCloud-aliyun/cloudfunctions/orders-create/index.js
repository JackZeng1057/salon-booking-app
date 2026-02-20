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
  ensureSlotDocsExist,
  lockSlotTimesForOrder,
  isBarberAssignedToService
} = require('sb-common');

// 创建订单：
// 1) 校验门店/服务/理发师归属
// 2) 计算服务时长并锁定多段 5 分钟 slots
// 3) 失败回滚订单与 slot 占用，确保一致性

// 生成 6 位核验码
function generateVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 生成订单号（时间戳 + 随机数）
function generateOrderNo() {
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `OD${Date.now()}${rand}`;
}

// 创建预约订单
exports.main = withResponse(async (event, context) => {
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  // 权限校验：仅 user 可创建
  const user = await requireRole(['user'], event, context);

  // 读取入参
  const storeId = (event && event.storeId) || '';
  const serviceId = (event && event.serviceId) || '';
  const barberId = (event && event.barberId) || '';
  const date = (event && event.date) || '';
  const startTime = (event && event.startTime) || '';
  const remark = String((event && event.remark) || '').trim().slice(0, 120);

  // 参数校验
  if (!storeId || !serviceId || !barberId || !date || !startTime) {
    throw new ApiError(400, 'storeId, serviceId, barberId, date, startTime required');
  }
  if (!isValidBookingDate(date)) {
    throw new ApiError(400, 'invalid date format');
  }
  if (!isValidBookingTime(startTime)) {
    throw new ApiError(400, 'invalid time format');
  }

  const db = uniCloud.database();

  // 校验服务归属门店，仅取所需字段减少读取量
  const serviceRes = await db
    .collection('services')
    .doc(serviceId)
    .field({ storeId: true, name: true, duration: true, durationMin: true, price: true })
    .get();
  const service = serviceRes.data && serviceRes.data[0];
  if (!service || service.storeId !== storeId) {
    throw new ApiError(400, 'service not belongs to store');
  }

  // 校验理发师归属门店，仅取所需字段减少读取量
  const barberRes = await db
    .collection('users')
    .doc(barberId)
    .field({ storeId: true, role: true, name: true, username: true })
    .get();
  const barber = barberRes.data && barberRes.data[0];
  if (!barber || barber.storeId !== storeId || barber.role !== 'barber') {
    throw new ApiError(400, 'barber not belongs to store');
  }

  // 服务能力校验：
  // 1) 优先使用管理员配置的理发师项目(serviceIds)
  // 2) 若未配置则回退到历史一一配对规则，避免老数据不可下单
  const canServe = await isBarberAssignedToService(db, { storeId, barberId, serviceId });
  if (!canServe) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'barber not available for selected service');
  }

  // 获取门店信息用于订单快照，仅取所需字段减少读取量
  const storeRes = await db
    .collection('stores')
    .doc(storeId)
    .field({ name: true })
    .get();
  const store = storeRes.data && storeRes.data[0];

  // 计算 endTime（优先使用 duration，其次 durationMin）
  const durationMin = Number(service.duration || service.durationMin || 30);
  const startMin = timeToMinutes(startTime);
  if (Number.isNaN(startMin)) {
    throw new ApiError(400, 'invalid startTime');
  }
  if (!isAlignedToSlotStep(startMin)) {
    throw new ApiError(400, 'startTime not aligned');
  }
  // endTime 仅用于展示与订单快照
  const endTime = minutesToTime(startMin + durationMin);

  const startMs = new Date(`${date}T${startTime}:00+08:00`).getTime();
  const now = Date.now();
  // 预约窗口：未被预约的时段在开始前 5 分钟停止预约
  if (startMs && startMs <= now + 5 * 60 * 1000) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'booking_window_closed');
  }

  // 先创建订单记录
  const orderNo = generateOrderNo();
  const verifyCode = generateVerifyCode();
  const orderRes = await db.collection('orders').add({
    orderNo,
    userId: user._id || user.uid || user.userId,
    storeId,
    barberId,
    serviceId,
    storeName: (store && store.name) || '',
    serviceName: service.name || '',
    barberName: barber.name || barber.username || '',
    price: Number(service.price || 0),
    date,
    startTime,
    endTime,
    status: 'BOOKED',
    verifyCode,
    remark,
    createdAt: now,
    updatedAt: now
  });

  const orderId = orderRes.id || (orderRes.ids && orderRes.ids[0]);
  if (!orderId) {
    throw new ApiError(500, 'create order failed');
  }

  try {
    const slotTimes = buildRequiredSlotStartTimes(startTime, durationMin);
    await ensureSlotTimesWithinSchedule(db, barberId, date, slotTimes);
    await ensureSlotDocsExist(db, { storeId, barberId, date, slotTimes });
    await lockSlotTimesForOrder(db, { barberId, date, slotTimes, orderId });

    // 创建订单项（拆分集合）
    await db.collection('order_items').add({
      orderId,
      serviceId,
      name: service.name || '',
      price: Number(service.price || 0),
      qty: 1,
      createdAt: now
    });

    // 记录状态事件
    await logOrderEvent(db, {
      orderId,
      fromStatus: 'INIT',
      toStatus: 'BOOKED',
      opUserId: user._id || user.uid || user.userId,
      role: 'user',
      ts: now,
      remark: 'create'
    });

    await logAudit(db, {
      actorId: user._id || user.uid || user.userId,
      role: 'user',
      action: 'create',
      orderId,
      time: now,
      result: 'success',
      requestId
    });
  } catch (err) {
    if (err && err.message === 'slot_conflict') {
      try {
        await db.collection('orders').doc(orderId).remove();
      } catch (rollbackErr) {
        console.error('rollback order after slot conflict failed:', rollbackErr);
      }
    }

    await logAudit(db, {
      actorId: user._id || user.uid || user.userId,
      role: 'user',
      action: 'create',
      orderId,
      time: Date.now(),
      result: 'failed',
      message: err.message || 'create_failed',
      requestId
    });
    throw err;
  }

  // 发送预约成功通知（失败不影响主流程）
  try {
    const userId = user._id || user.uid || user.userId;
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'booking_success',
        title: '预约成功',
        content: `您已成功预约 ${date} ${startTime} 的服务，核验码：${verifyCode}，请按时到店。`,
        relatedId: orderId
      }
    });

    // 通知理发师：有新的预约
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: barberId,
        type: 'arrival_reminder',
        title: '新预约提醒',
        content: `您有一条新的预约：${date} ${startTime}（核验码 ${verifyCode}）。`,
        relatedId: orderId
      }
    });

    // 通知店家：有新的预约（同店多个管理员全部通知）
    const adminRes = await db
      .collection('users')
      .where({ role: 'admin', storeId })
      .field({ _id: true })
      .get();
    const admins = adminRes.data || [];
    for (let i = 0; i < admins.length; i += 1) {
      const admin = admins[i] || {};
      const adminId = admin._id || '';
      if (!adminId || adminId === userId) continue;
      await uniCloud.callFunction({
        name: 'notifications-create',
        data: {
          userId: adminId,
          type: 'arrival_reminder',
          title: '新预约提醒',
          content: `门店收到新预约：${date} ${startTime}（核验码 ${verifyCode}）。`,
          relatedId: orderId
        }
      });
    }
  } catch (err) {
    console.error('send notification error:', err);
  }

  // 返回订单信息
  return {
    orderId,
    orderNo,
    verifyCode,
    status: 'BOOKED',
    date,
    startTime,
    endTime
  };
});
