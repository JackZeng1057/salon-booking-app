const { withResponse, ApiError, requireRole, normalizeIdList } = require('sb-common');

exports.main = withResponse(async (event, context) => {
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

  const targetBarberIds = overwriteAll ? Array.from(barberIdSet) : Array.from(normalizedAssignments.keys());
  for (let i = 0; i < targetBarberIds.length; i += 1) {
    const barberId = targetBarberIds[i];
    await db.collection('users').doc(barberId).update({
      serviceIds: normalizedAssignments.get(barberId) || [],
      updatedAt: now
    });
  }

  await db.collection('stores').doc(storeId).update({
    barberServiceAssignmentEnabled: true,
    updatedAt: now
  });

  return {
    storeId,
    updatedCount: targetBarberIds.length
  };
});
