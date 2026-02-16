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

function normalizeDuration(duration, fallback) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

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

async function isBarberAssignedToService(db, { storeId = '', barberId = '', serviceId = '' } = {}) {
  if (!storeId || !barberId || !serviceId) return false;

  const explicitServiceIds = await getBarberExplicitServiceIds(db, { barberId });
  if (explicitServiceIds.length > 0) {
    return explicitServiceIds.includes(serviceId);
  }

  if (await hasStoreExplicitAssignments(db, { storeId })) {
    return false;
  }

  const { serviceList, barberList } = await fetchLegacyStoreLists(db, storeId);
  const pairCount = Math.min(serviceList.length, barberList.length);
  const serviceIndex = serviceList.findIndex((item) => item && item._id === serviceId);
  if (pairCount <= 0 || serviceIndex < 0 || serviceIndex >= pairCount) {
    return false;
  }
  const assignedBarber = barberList[serviceIndex];
  return !!assignedBarber && assignedBarber._id === barberId;
}

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

  if (await hasStoreExplicitAssignments(db, { storeId })) {
    return fallback;
  }

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
