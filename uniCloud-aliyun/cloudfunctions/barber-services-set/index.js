/**
 * barber-services-set 云函数 —— 管理员配置理发师可接服务项目
 *
 * 【业务说明】
 * 门店管理员分配理发师实际可接待的服务类型，
 * 下单时前端根据所选理发师动态过滤可选服务列表。
 *
 * 【入参】
 * - assignments : [{ barberId, serviceIds[] }]  逐个理发师的服务绑定
 * - overwriteAll: boolean（默认 true）
 *     true  = 覆盖模式：将本门店所有理发师均更新（未传入的理发师 serviceIds 清空）
 *     false = 增量模式：仅更新 assignments 中显式传入的理发师
 *
 * 【安全设计】
 * 白名单校验：barberId 与 serviceId 均须属于当前管理员所在门店，防止越权赋值
 *
 * 【权限】
 * - 仅 admin 角色可调用
 */
const { withResponse, ApiError, requireRole, normalizeIdList } = require('sb-common');

exports.main = withResponse(async (event, context) => {
  // 仅门店管理员可操作；storeId 来自管理员 token，客户端不可伪造
  const admin = await requireRole(['admin'], event, context);
  const storeId = (admin && admin.storeId) || '';
  if (!storeId) {
    throw new ApiError(400, 'admin storeId required');
  }

  const assignments = event && event.assignments;
  const overwriteAll = !(event && event.overwriteAll === false);
  if (!Array.isArray(assignments)) {
    throw new ApiError(400, 'assignments must be array');
  }

  const db = uniCloud.database();
  const now = Date.now();

  // 并行拉取当前门店合法 barberId / serviceId 白名单，防止客户端传入跨店 ID
  const [barberRes, serviceRes] = await Promise.all([
    db
      .collection('users')
      .where({ storeId, role: 'barber' })
      .field({ _id: true })
      .get(),
    db
      .collection('services')
      .where({ storeId })
      .field({ _id: true })
      .get()
  ]);
  const barbers = (barberRes && barberRes.data) || [];
  const services = (serviceRes && serviceRes.data) || [];
  const barberIdSet = new Set(barbers.map((item) => item && item._id).filter((id) => !!id));
  const serviceIdSet = new Set(services.map((item) => item && item._id).filter((id) => !!id));

  // 标准化入参并校验 ID 有效性：任何不属于本店的 barberId/serviceId 直接拒绝
  const normalizedAssignments = new Map();
  assignments.forEach((item) => {
    const row = item || {};
    const barberId = String(row.barberId || '').trim();
    if (!barberId || !barberIdSet.has(barberId)) {
      throw new ApiError(400, 'invalid barberId');
    }
    const serviceIds = normalizeIdList(row.serviceIds);
    serviceIds.forEach((serviceId) => {
      if (!serviceIdSet.has(serviceId)) {
        throw new ApiError(400, 'invalid serviceId');
      }
    });
    normalizedAssignments.set(barberId, serviceIds);
  });

  // 覆盖模式：遍历门店所有理发师（未在 assignments 中传入的理发师 serviceIds 置空）
  // 增量模式：只更新 assignments 中显式传入的理发师，其余保持不变
  const targetBarberIds = overwriteAll ? Array.from(barberIdSet) : Array.from(normalizedAssignments.keys());
  for (let i = 0; i < targetBarberIds.length; i += 1) {
    const barberId = targetBarberIds[i];
    await db.collection('users').doc(barberId).update({
      serviceIds: normalizedAssignments.get(barberId) || [],
      updatedAt: now
    });
  }

  // 标记门店已启用“显式服务绑定”策略
  await db.collection('stores').doc(storeId).update({
    barberServiceAssignmentEnabled: true,
    updatedAt: now
  });

  return {
    storeId,
    updatedCount: targetBarberIds.length
  };
});
