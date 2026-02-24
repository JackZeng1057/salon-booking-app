/**
 * store-update-profile 云函数 —— 门店资料更新（管理员）
 *
 * 【业务说明】
 * 门店管理员修改自己门店的基础信息、营业时间、预约规则和服务项目清单。
 * 只更新请求中显式传入的字段（hasOwn 判断），避免覆盖未传字段。
 *
 * 【字段更新策略】
 * 使用 hasOwn() 安全判断，区分"字段未传"与"字段传空值"两种语义，
 * 确保客户端不传的字段不会被意外清空。
 *
 * 【服务项目全量同步策略】
 * 传入 services 时执行完整的三路合并：
 * - 有 _id 且属于本店 → UPDATE（保留）
 * - 有 name 但无匹配 _id → ADD（新增）
 * - 旧服务中未出现在新列表的 → DELETE（删除）
 * 删除后联动清理理发师 serviceIds 中的失效项，防止下单时出现脏引用。
 *
 * 【权限】
 * - 仅 admin 角色可调用，storeId 从 token 中取得，不可由客户端伪造
 */
const { withResponse, ApiError, requireRole, normalizeIdList } = require('sb-common');

// 安全判断对象是否显式包含某字段（区分“未传”与“传空值”）
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

// 文本字段标准化：去前后空白并限制长度
function normalizeText(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

// 标准化单个服务项并做格式校验
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
  if (!Number.isFinite(price) || price <= 0) {
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

// 门店资料更新入口
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

  // 仅更新请求中显式传入的字段
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
    if (normalizedServices.length === 0) {
      throw new ApiError(400, 'services required');
    }

    // 服务项目全量同步策略：保留 / 更新 / 新增 / 删除
    // 先拉取数据库中旧服务 ID 全集，后面三路对比
    const _ = db.command;
    const servicesCol = db.collection('services');
    const oldRes = await servicesCol.where({ storeId }).field({ _id: true }).get();
    const oldList = oldRes.data || [];
    // oldIds：数据库已有的服务 ID 集合，用于区分更新与新增
    const oldIds = new Set(oldList.map((item) => item && item._id).filter((id) => !!id));
    // keepIds：新列表处理后需保留的 ID（包括更新项和新增项生成的 ID）
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
        // 已存在的服务：执行 UPDATE 并加入保留集
        await servicesCol.doc(svc._id).update(doc);
        keepIds.add(svc._id);
      } else {
        // 新服务（无 _id 或 ID 不在库中）：执行 ADD
        const addRes = await servicesCol.add({
          ...doc,
          createdAt: now
        });
        const newId = addRes.id || (addRes.data && addRes.data[0] && addRes.data[0]._id) || '';
        if (newId) keepIds.add(newId);
      }
    }

    // 不在新列表中的旧服务 → DELETE（从 services 集合中彻底删除）
    const removeIds = oldList
      .map((item) => item && item._id)
      .filter((id) => !!id && !keepIds.has(id));
    if (removeIds.length > 0) {
      await servicesCol.where({ storeId, _id: _.in(removeIds) }).remove();

      // 服务被删除后，自动清理理发师上已失效的 serviceIds，避免出现不可见脏配置
      const removeIdSet = new Set(removeIds);
      const barberRes = await db
        .collection('users')
        .where({ storeId, role: 'barber' })
        .field({ _id: true, serviceIds: true })
        .get();
      const barbers = barberRes.data || [];
      for (let i = 0; i < barbers.length; i += 1) {
        const barber = barbers[i] || {};
        const current = normalizeIdList(barber.serviceIds);
        const next = current.filter((id) => !removeIdSet.has(id));
        if (next.length === current.length) continue;
        await db.collection('users').doc(barber._id).update({
          serviceIds: next,
          updatedAt: now
        });
      }
    }

    servicesProcessed = true;
    // 门店起价与服务列表保持一致，避免出现 0 元/缺失导致的排序脏数据。
    const minServicePrice = normalizedServices.reduce((min, item) => {
      const price = Number(item && item.price);
      if (!Number.isFinite(price) || price <= 0) return min;
      if (min === null || price < min) return price;
      return min;
    }, null);
    if (minServicePrice !== null) {
      updateData.minPrice = Number(minServicePrice.toFixed(2));
    }
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
