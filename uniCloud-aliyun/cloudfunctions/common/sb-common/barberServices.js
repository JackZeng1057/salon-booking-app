/**
 * 理发师与服务项目绑定关系工具
 * 支持两套策略：
 * 1) 显式绑定：users.serviceIds
 * 2) 兼容旧逻辑：按门店服务列表与理发师列表的“同下标配对”
 */

// 归一化 ID 数组：去空、去重、转字符串
function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

// 归一化时长：无效值时回退默认值
function normalizeDuration(duration, fallback) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

// 读取旧系统中的服务列表与理发师列表（用于兼容配对规则）
async function fetchLegacyStoreLists(db, storeId) {
  const [serviceRes, barberRes] = await Promise.all([
    db
      .collection('services')
      .where({ storeId })
      .field({ _id: true, name: true, duration: true, durationMin: true })
      .orderBy('createdAt', 'desc')
      .get(),
    db
      .collection('users')
      .where({ storeId, role: 'barber' })
      .field({ _id: true })
      .orderBy('createdAt', 'desc')
      .get()
  ]);
  return {
    serviceList: (serviceRes && serviceRes.data) || [],
    barberList: (barberRes && barberRes.data) || []
  };
}

// 获取理发师显式绑定的服务 ID 列表
async function getBarberExplicitServiceIds(db, { barberId = '' } = {}) {
  if (!barberId) return [];
  const barberRes = await db
    .collection('users')
    .doc(barberId)
    .field({ serviceIds: true })
    .get();
  const barber = barberRes.data && barberRes.data[0];
  return normalizeIdList(barber && barber.serviceIds);
}

// 判断门店是否已开启“显式绑定模式”
async function hasStoreExplicitAssignments(db, { storeId = '' } = {}) {
  if (!storeId) return false;

  const storeRes = await db
    .collection('stores')
    .doc(storeId)
    .field({ barberServiceAssignmentEnabled: true })
    .get();
  const store = storeRes.data && storeRes.data[0];
  if (store && store.barberServiceAssignmentEnabled === true) {
    return true;
  }

  const barberRes = await db
    .collection('users')
    .where({ storeId, role: 'barber' })
    .field({ serviceIds: true })
    .get();
  return (barberRes.data || []).some((item) => normalizeIdList(item && item.serviceIds).length > 0);
}

// 判断某理发师是否可执行指定服务
async function isBarberAssignedToService(db, { storeId = '', barberId = '', serviceId = '' } = {}) {
  if (!storeId || !barberId || !serviceId) return false;

  // 优先使用显式绑定（精确控制）
  const explicitServiceIds = await getBarberExplicitServiceIds(db, { barberId });
  if (explicitServiceIds.length > 0) {
    return explicitServiceIds.includes(serviceId);
  }

  // 门店已启用显式绑定但当前理发师未配置，则视为不可服务
  if (await hasStoreExplicitAssignments(db, { storeId })) {
    return false;
  }

  // 回退旧配对逻辑：serviceList[i] -> barberList[i]
  const { serviceList, barberList } = await fetchLegacyStoreLists(db, storeId);
  const pairCount = Math.min(serviceList.length, barberList.length);
  const serviceIndex = serviceList.findIndex((item) => item && item._id === serviceId);
  if (pairCount <= 0 || serviceIndex < 0 || serviceIndex >= pairCount) {
    return false;
  }
  const assignedBarber = barberList[serviceIndex];
  return !!assignedBarber && assignedBarber._id === barberId;
}

// 解析理发师默认服务（用于无明确 serviceId 的流程，如排班占位估算）
async function resolveAssignedServiceForBarber(
  db,
  { storeId = '', barberId = '', defaultDurationMin = 30, defaultName = '默认服务' } = {}
) {
  const fallback = {
    id: '',
    durationMin: defaultDurationMin,
    name: defaultName
  };
  if (!storeId || !barberId) return fallback;

  // 显式绑定模式：按 serviceIds 顺序取第一个有效服务作为默认项
  const explicitServiceIds = await getBarberExplicitServiceIds(db, { barberId });
  if (explicitServiceIds.length > 0) {
    const _ = db.command;
    const serviceRes = await db
      .collection('services')
      .where({ storeId, _id: _.in(explicitServiceIds) })
      .field({ _id: true, name: true, duration: true, durationMin: true })
      .get();
    const serviceMap = new Map();
    (serviceRes.data || []).forEach((item) => {
      if (item && item._id) {
        serviceMap.set(item._id, item);
      }
    });
    for (let i = 0; i < explicitServiceIds.length; i += 1) {
      const id = explicitServiceIds[i];
      const service = serviceMap.get(id);
      if (!service) continue;
      return {
        id: service._id || '',
        durationMin: normalizeDuration(service.duration || service.durationMin, fallback.durationMin),
        name: service.name || fallback.name
      };
    }
  }

  // 门店开启显式绑定但当前理发师无配置：直接回退默认项
  if (await hasStoreExplicitAssignments(db, { storeId })) {
    return fallback;
  }

  // 兼容旧配对逻辑：根据理发师在列表中的下标匹配服务
  const { serviceList, barberList } = await fetchLegacyStoreLists(db, storeId);
  const pairCount = Math.min(serviceList.length, barberList.length);
  const barberIndex = barberList.findIndex((item) => item && item._id === barberId);
  if (barberIndex < 0 || barberIndex >= pairCount) {
    return fallback;
  }

  const service = serviceList[barberIndex] || {};
  return {
    id: service._id || '',
    durationMin: normalizeDuration(service.duration || service.durationMin, fallback.durationMin),
    name: service.name || fallback.name
  };
}

module.exports = {
  normalizeIdList,
  getBarberExplicitServiceIds,
  hasStoreExplicitAssignments,
  isBarberAssignedToService,
  resolveAssignedServiceForBarber
};
