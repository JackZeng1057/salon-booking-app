/**
 * orders-create 云函数 —— 创建预约订单
 *
 * 【业务流程概述】
 * 用户在前端选择门店、服务项目、理发师、日期和时间后，
 * 提交到本云函数完成预约创建。整个流程分为以下阶段：
 *
 *   阶段一：权限与参数校验
 *     - 仅 user 角色可创建订单（requireRole）
 *     - 校验日期/时间格式与时间对齐（5分钟边界）
 *     - 预约窗口检查：距开始时间不足 5 分钟则拒绝（避免无效预约）
 *
 *   阶段二：数据一致性校验
 *     - 服务归属门店校验：serviceId 必须属于 storeId
 *     - 理发师归属门店校验：barberId 必须属于 storeId 且 role='barber'
 *     - 服务能力校验：理发师必须被分配了该服务项目（barber_services 集合）
 *
 *   阶段三：时段计算
 *     - 根据服务时长 durationMin 和缓冲 REST_GAP_MIN，
 *       计算需要锁定的所有 5 分钟 slot 起点列表
 *
 *   阶段四：先写订单，再锁时段（写入顺序的设计原因）
 *     先写 orders 文档是为了拿到 orderId，
 *     再用 orderId 去锁 time_slots（关联字段）。
 *     若 slot 锁定失败，立即回滚删除 orders 文档，保证一致性。
 *
 *   阶段五：补充写入
 *     - order_items：服务项目快照（拆分集合，支持多项服务扩展）
 *     - order_events：状态流转日志（INIT → BOOKED）
 *     - audit_logs：操作审计日志
 *
 *   阶段六：通知（fire-and-forget）
 *     - 用户：预约成功通知（含 6 位核验码）
 *     - 理发师：新预约提醒
 *     - 管理员：新预约提醒（同店所有 admin 均收到）
 *
 * 【核验码设计】
 * 订单创建时生成 6 位随机数字 verifyCode，通知给用户。
 * 用户到店后向管理员出示，管理员在"核验"页输入验证码完成到店确认，
 * 订单状态变为 ARRIVED，此后理发师可开始服务。
 * 这一设计避免了用户无故不到店（爽约）的核查困难。
 *
 * 【引入的 sb-common 工具函数说明】
 *   withResponse      : 统一响应包装（捕获错误、格式化返回）
 *   requireRole       : 角色鉴权中间件（本接口仅 user 可访问）
 *   logAudit          : 写操作审计日志到 audit_logs 集合
 *   logOrderEvent     : 写订单状态事件到 order_events 集合
 *   isValidBookingDate/Time : 参数格式校验
 *   timeToMinutes / minutesToTime : 时间计算工具
 *   isAlignedToSlotStep : 5分钟对齐检查
 *   buildRequiredSlotStartTimes : 生成待锁定时段列表
 *   ensureSlotTimesWithinSchedule : 排班区间校验
 *   ensureSlotTimesWithinBusinessHours : 营业时间校验
 *   ensureSlotDocsExist : 按需补建 time_slots 文档
 *   lockSlotTimesForOrder : 并发安全的时段锁定
 *   isBarberAssignedToService : 服务能力校验
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
  lockSlotTimesForOrder,
  isBarberAssignedToService
} = require('sb-common');

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

  // ─── 阶段四：先写订单文档，再锁时段 ───────────────────────────────────────
  // orders 文档包含完整的"订单快照"（门店/服务/理发师名称等），
  // 即使关联数据后续被修改，历史订单仍能正确展示预约时的信息。
  // 快照字段（storeName/serviceName/barberName/price）在写入时固化，不再动态关联查询。
  const orderNo = generateOrderNo();
  const verifyCode = generateVerifyCode();
  const orderRes = await db.collection('orders').add({
    orderNo,
    userId: user._id || user.uid || user.userId,
    storeId,
    barberId,
    serviceId,
    storeName: (store && store.name) || '',   // 快照：门店名称
    serviceName: service.name || '',           // 快照：服务名称
    barberName: barber.username || barber.name || '',  // 快照：理发师名称
    price: Number(service.price || 0),         // 快照：服务价格（元）
    date,
    startTime,
    endTime,
    status: 'BOOKED',
    verifyCode,    // 6位核验码，用户到店时向管理员出示完成 ARRIVED 确认
    remark,
    createdAt: now,
    updatedAt: now
  });

  const orderId = orderRes.id || (orderRes.ids && orderRes.ids[0]);
  if (!orderId) {
    throw new ApiError(500, 'create order failed');
  }

  try {
    // ─── 阶段三：时段锁定（必须在 orderId 生成后执行）──────────────────────
    const slotTimes = buildRequiredSlotStartTimes(startTime, durationMin);
    // 双重校验：排班区间 → 营业时间区间（均通过后才进行锁定）
    await ensureSlotTimesWithinSchedule(db, barberId, date, slotTimes);
    await ensureSlotTimesWithinBusinessHours(db, storeId, date, slotTimes);
    // 按需补建 time_slots 文档（首次预约该时段时才插入）
    await ensureSlotDocsExist(db, { storeId, barberId, date, slotTimes });
    // 乐观锁锁定：失败（slot_conflict）则抛出 ApiError，进入 catch 回滚
    await lockSlotTimesForOrder(db, { barberId, date, slotTimes, orderId });

    // ─── 阶段五：补充写入（订单明细 + 状态事件 + 审计日志）────────────────
    // order_items：记录本次服务的详细信息，支持未来扩展为多服务项订单
    await db.collection('order_items').add({
      orderId,
      serviceId,
      name: service.name || '',
      price: Number(service.price || 0),
      qty: 1,
      createdAt: now
    });

    // order_events：记录状态流转日志（INIT→BOOKED），便于后续查看订单生命周期
    await logOrderEvent(db, {
      orderId,
      fromStatus: 'INIT',
      toStatus: 'BOOKED',
      opUserId: user._id || user.uid || user.userId,
      role: 'user',
      ts: now,
      remark: 'create'
    });

    // audit_logs：操作审计，记录"谁在什么时间创建了哪个订单"，用于安全追溯
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
    // ─── 回滚：slot 锁定失败时删除已创建的 orders 文档 ─────────────────────
    // 保证"orders 存在 ↔ slot 已锁定"的状态一致性，防止出现"有订单但时段未锁"的悬空记录
    if (err && err.message === 'slot_conflict') {
      try {
        await db.collection('orders').doc(orderId).remove();
      } catch (rollbackErr) {
        console.error('rollback order after slot conflict failed:', rollbackErr);
      }
    }

    // 失败审计：即使主流程失败，也要记录失败事件，保持审计日志的完整性
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
    // 向上抛出，由 withResponse 捕获并按 ApiError / 系统错误分类返回响应
    throw err;
  }

  // ─── 阶段六：推送通知（Fire-and-Forget 模式）─────────────────────────────
  // 通知写入失败不影响预约结果：外层 try/catch 吞掉所有通知异常，
  // 确保订单已创建成功的情况下不会因通知失败而向客户端报错。
  try {
    const userId = user._id || user.uid || user.userId;

    // 通知顾客：预约确认 + 核验码（顾客到店时凭核验码核销）
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

    // 通知理发师：有新的预约，提醒做好准备
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

    // 通知店铺管理员：遍历同店所有 admin，排除顾客本人（防止同账号兼任时重复通知）
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
    // 通知失败仅记录日志，不向前端暴露错误，保证主流程体验
    console.error('send notification error:', err);
  }

  // ─── 返回：前端所需的最小数据集 ─────────────────────────────────────────
  // orderId：用于后续查询订单详情 / 取消订单
  // orderNo：人类可读的订单编号，便于客服核对
  // verifyCode：6位纯数字核验码，到店核销时由理发师或店员扫码/输入确认
  // status：'BOOKED' 表示预约已确认，前端据此跳转至订单详情页
  // date / startTime / endTime：供详情页直接展示，无需再次查询
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
