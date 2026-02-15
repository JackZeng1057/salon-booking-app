const { withResponse, ApiError, requireRole } = require('sb-common');

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeText(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeServiceItem(item) {
  const source = item || {};
  const id = normalizeText(source._id, 64);
  const name = normalizeText(source.name, 40);
  const priceRaw = String(source.price || '').trim();
  const durationRaw = String(source.duration || '').trim();
  const description = normalizeText(source.description, 120);
  const hasAny = !!(name || priceRaw || durationRaw || description);

  // 允许空行（前端新增未填写），在服务列表处理中会直接忽略
  if (!hasAny) return null;

  if (!name) {
    throw new ApiError(400, 'service name required');
  }

  const price = Number(source.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new ApiError(400, 'invalid service price');
  }

  const duration = Math.round(Number(source.duration));
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
    throw new ApiError(400, 'invalid service duration');
  }

  return {
    _id: id,
    name,
    price: Number(price.toFixed(2)),
    duration,
    description
  };
}

exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const storeId = (admin && admin.storeId) || '';
  if (!storeId) {
    throw new ApiError(400, 'admin storeId required');
  }

  const db = uniCloud.database();
  const storeRes = await db.collection('stores').doc(storeId).get();
  const existed = storeRes.data && storeRes.data[0];
  if (!existed) {
    throw new ApiError(404, 'store not found');
  }

  const now = Date.now();
  const payload = event || {};
  const updateData = { updatedAt: now };

  if (hasOwn(payload, 'name')) {
    updateData.name = normalizeText(payload.name, 60);
  }
  if (hasOwn(payload, 'address')) {
    updateData.address = normalizeText(payload.address, 120);
  }
  if (hasOwn(payload, 'phone')) {
    updateData.phone = normalizeText(payload.phone, 30);
  }
  if (hasOwn(payload, 'description')) {
    updateData.description = normalizeText(payload.description, 500);
  }
  if (hasOwn(payload, 'cover')) {
    updateData.cover = normalizeText(payload.cover, 800);
  }

  if (hasOwn(payload, 'tags')) {
    if (!Array.isArray(payload.tags)) {
      throw new ApiError(400, 'tags must be array');
    }
    updateData.tags = payload.tags
      .map((item) => normalizeText(item, 20))
      .filter((item) => !!item)
      .slice(0, 8);
  }

  if (hasOwn(payload, 'businessHours')) {
    const businessHours = payload.businessHours || {};
    if (typeof businessHours !== 'object' || Array.isArray(businessHours)) {
      throw new ApiError(400, 'businessHours must be object');
    }
    updateData.businessHours = {
      weekday: normalizeText(businessHours.weekday, 30),
      weekend: normalizeText(businessHours.weekend, 30)
    };
  }

  if (hasOwn(payload, 'bookingRules')) {
    const bookingRules = payload.bookingRules || {};
    if (typeof bookingRules !== 'object' || Array.isArray(bookingRules)) {
      throw new ApiError(400, 'bookingRules must be object');
    }
    updateData.bookingRules = {
      notice: normalizeText(bookingRules.notice, 300),
      cancelRule: normalizeText(bookingRules.cancelRule, 300),
      rescheduleRule: normalizeText(bookingRules.rescheduleRule, 300)
    };
  }

  let servicesProcessed = false;
  if (hasOwn(payload, 'services')) {
    if (!Array.isArray(payload.services)) {
      throw new ApiError(400, 'services must be array');
    }
    const normalizedServices = payload.services
      .map((item) => normalizeServiceItem(item))
      .filter((item) => !!item)
      .slice(0, 30);

    const _ = db.command;
    const servicesCol = db.collection('services');
    const oldRes = await servicesCol.where({ storeId }).field({ _id: true }).get();
    const oldList = oldRes.data || [];
    const oldIds = new Set(oldList.map((item) => item && item._id).filter((id) => !!id));
    const keepIds = new Set();

    for (const svc of normalizedServices) {
      const doc = {
        storeId,
        name: svc.name,
        price: svc.price,
        duration: svc.duration,
        description: svc.description,
        updatedAt: now
      };

      if (svc._id && oldIds.has(svc._id)) {
        await servicesCol.doc(svc._id).update(doc);
        keepIds.add(svc._id);
      } else {
        const addRes = await servicesCol.add({
          ...doc,
          createdAt: now
        });
        const newId = addRes.id || (addRes.data && addRes.data[0] && addRes.data[0]._id) || '';
        if (newId) keepIds.add(newId);
      }
    }

    const removeIds = oldList
      .map((item) => item && item._id)
      .filter((id) => !!id && !keepIds.has(id));
    if (removeIds.length > 0) {
      await servicesCol.where({ storeId, _id: _.in(removeIds) }).remove();
    }

    servicesProcessed = true;
  }

  const updatedFields = Object.keys(updateData).filter((key) => key !== 'updatedAt');
  if (updatedFields.length === 0 && !servicesProcessed) {
    return { storeId, updated: false };
  }

  if (updatedFields.length > 0) {
    await db.collection('stores').doc(storeId).update(updateData);
  }

  const resultFields = [...updatedFields];
  if (servicesProcessed) {
    resultFields.push('services');
  }
  return {
    storeId,
    updated: true,
    updatedFields: resultFields
  };
});
