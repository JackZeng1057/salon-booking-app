const { withResponse, ApiError, ERROR_CODES, requireRole, logAudit, logOrderEvent } = require('sb-common');

// 订单改期：
// 1) 先占用新时段（多段 5 分钟 slots）
// 2) 更新订单时间与记录改期来源
// 3) 最后释放旧时段，确保改期成功才释放

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

// 改期预约（占新优先）
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
  if (!isValidDate(newDate)) {
    throw new ApiError(400, 'invalid date format');
  }
  if (!isValidTime(newStartTime)) {
    throw new ApiError(400, 'invalid time format');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  // 仅取改期校验所需字段，减少读取量
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
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
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
  if (Number.isNaN(startMin) || !ensureAligned(startMin)) {
    throw new ApiError(400, 'invalid startTime');
  }
  // endTime 仅用于展示与订单快照
  const newEndTime = minutesToTime(startMin + durationMin);

  const startMs = new Date(`${newDate}T${newStartTime}:00+08:00`).getTime();
  if (startMs && startMs <= Date.now()) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'time_expired');
  }

  const _ = db.command;
  const newSlotTimes = buildSlotStartTimes(newStartTime, durationMin);
  await ensureSlotsExist(db, order.storeId || '', order.barberId, newDate, newSlotTimes);

  // 先尝试占用新 slot，避免释放旧 slot 后抢占失败
  const slotUpdate = await db
    .collection('time_slots')
    .where({
      barberId: order.barberId,
      date: newDate,
      startTime: _.in(newSlotTimes),
      status: 'AVAILABLE'
    })
    .update({
      status: 'BOOKED',
      orderId,
      updatedAt: Date.now()
    });

  const updated = slotUpdate && slotUpdate.updated;
  if (updated !== newSlotTimes.length) {
    // 占用不完整，释放已占用的新 slot
    await db
      .collection('time_slots')
      .where({ barberId: order.barberId, date: newDate, orderId })
      .update({
        status: 'AVAILABLE',
        orderId: '',
        updatedAt: Date.now()
      });
    throw new ApiError(ERROR_CODES.CONFLICT, 'slot_conflict');
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

    const oldSlotTimes = buildSlotStartTimes(order.startTime, durationMin);
    // 释放旧 slot
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
