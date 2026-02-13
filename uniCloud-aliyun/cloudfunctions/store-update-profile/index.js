const { withResponse, ApiError, requireRole } = require('sb-common');

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeText(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
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

  const updatedFields = Object.keys(updateData).filter((key) => key !== 'updatedAt');
  if (updatedFields.length === 0) {
    return { storeId, updated: false };
  }

  await db.collection('stores').doc(storeId).update(updateData);

  return {
    storeId,
    updated: true,
    updatedFields
  };
});
