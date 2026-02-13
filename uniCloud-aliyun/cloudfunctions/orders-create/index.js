const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 创建订单：
// 1) 校验门店/服务/理发师归属
// 2) 计算服务时长并锁定多段 5 分钟 slots
// 3) 失败回滚订单与 slot 占用，确保一致性

// 校验日期格式是否为 YYYY-MM-DD
function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 校验时间格式是否为 HH:mm
function isValidTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

// 将 HH:mm 转换为分钟数
function timeToMinutes(time) {
  if (!isValidTime(time)) return NaN;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

// 将分钟数转换为 HH:mm
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

const SLOT_STEP_MIN = 5;
const REST_GAP_MIN = 5;

function ensureAligned(minutes) {
  return minutes % SLOT_STEP_MIN === 0;
}

// 根据服务时长计算需要占用的 slot 起始时间列表
function buildSlotStartTimes(startTime, durationMin) {
  const startMin = timeToMinutes(startTime);
  const requiredMin = durationMin + REST_GAP_MIN;
  const slotsNeeded = Math.ceil(requiredMin / SLOT_STEP_MIN);
  const list = [];
  for (let i = 0; i < slotsNeeded; i += 1) {
    list.push(minutesToTime(startMin + i * SLOT_STEP_MIN));
  }
  return list;
}

// 确保目标时间段的 slots 已存在（排班漏生成时兜底创建）
async function ensureSlotsExist(db, storeId, barberId, date, slotTimes) {
  if (!slotTimes.length) return;
  const _ = db.command;
  const existingRes = await db
    .collection('time_slots')
    .where({ barberId, date, startTime: _.in(slotTimes) })
    .field({ startTime: true })
    .get();
  const existing = new Set((existingRes.data || []).map((item) => item.startTime));
  const missing = slotTimes.filter((time) => !existing.has(time));
  if (!missing.length) return;
  const now = Date.now();
  const docs = missing.map((startTime) => {
    const startMin = timeToMinutes(startTime);
    const endTime = minutesToTime(startMin + SLOT_STEP_MIN);
    return {
      storeId,
      barberId,
      date,
      startTime,
      endTime,
      status: 'AVAILABLE',
      updatedAt: now
    };
  });
  await db.collection('time_slots').add(docs);
}

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

  // 参数校验
  if (!storeId || !serviceId || !barberId || !date || !startTime) {
    throw new ApiError(400, 'storeId, serviceId, barberId, date, startTime required');
  }
  if (!isValidDate(date)) {
    throw new ApiError(400, 'invalid date format');
  }
  if (!isValidTime(startTime)) {
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
  if (!ensureAligned(startMin)) {
    throw new ApiError(400, 'startTime not aligned');
  }
  // endTime 仅用于展示与订单快照
  const endTime = minutesToTime(startMin + durationMin);

  const startMs = new Date(`${date}T${startTime}:00+08:00`).getTime();
  if (startMs && startMs <= Date.now()) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'time_expired');
  }

  // 先创建订单记录
  const orderNo = generateOrderNo();
  const verifyCode = generateVerifyCode();
  const now = Date.now();

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
    createdAt: now,
    updatedAt: now
  });

  const orderId = orderRes.id || (orderRes.ids && orderRes.ids[0]);
  if (!orderId) {
    throw new ApiError(500, 'create order failed');
  }

  try {
    const slotTimes = buildSlotStartTimes(startTime, durationMin);
    await ensureSlotsExist(db, storeId, barberId, date, slotTimes);
    const _ = db.command;
    // 尝试占用 slot：仅当全部 AVAILABLE 时更新为 BOOKED
    const slotUpdate = await db
      .collection('time_slots')
      .where({ barberId, date, startTime: _.in(slotTimes), status: 'AVAILABLE' })
      .update({
        status: 'BOOKED',
        orderId,
        updatedAt: Date.now()
      });

    const updated = slotUpdate && slotUpdate.updated;
    if (updated !== slotTimes.length) {
      // 占用不完整，释放已占用的 slot，并回滚订单
      await db
        .collection('time_slots')
        .where({ barberId, date, orderId })
        .update({
          status: 'AVAILABLE',
          orderId: '',
          updatedAt: Date.now()
        });
      // 占用失败，回滚订单
      await db.collection('orders').doc(orderId).remove();
      throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
    }

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
