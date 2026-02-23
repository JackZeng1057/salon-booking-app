// 引入统一响应包装
const { withResponse } = require('sb-common');

/**
 * 计算两点间的距离（单位：公里）
 * 使用球面距离公式
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371; // 地球半径(公里)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositivePrice(value) {
  const n = toFiniteNumber(value);
  return n !== null && n > 0 ? n : null;
}

async function resolveEffectiveMinPrice(db, store) {
  const directPrice = toPositivePrice(store && store.minPrice);
  let serviceMinPrice = null;
  try {
    const serviceRes = await db
      .collection('services')
      .where({ storeId: store && store._id })
      .field({ price: true })
      .orderBy('price', 'asc')
      .limit(1)
      .get();
    const first = serviceRes && serviceRes.data && serviceRes.data[0];
    serviceMinPrice = toPositivePrice(first && first.price);
  } catch (e) {
    serviceMinPrice = null;
  }
  if (directPrice === null) return serviceMinPrice;
  if (serviceMinPrice === null) return directPrice;
  return Math.min(directPrice, serviceMinPrice);
}

// 获取门店列表 - 支持搜索、筛选、排序
exports.main = withResponse(async (event, context) => {
  const db = uniCloud.database();
  const _ = db.command;

  // 分页参数
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 50);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 50;

  // 搜索关键词 (搜索门店名称、地址、标签)
  const keyword = (event && event.keyword) || '';
  
  // 筛选参数
  const minRating = event && event.minRating ? Number(event.minRating) : null; // 最低评分
  const maxPrice = event && event.maxPrice ? Number(event.maxPrice) : null; // 最高价格
  const tags = event && event.tags; // 标签筛选 (数组)
  
  // 排序参数：distance（距离）/ rating（评分）/ price（价格）/ default（默认）
  const sortBy = (event && event.sortBy) || 'default';
  const shouldUseEffectivePrice = sortBy === 'price' || !!maxPrice;
  
  // 用户位置 (用于距离筛选和排序)
  const userLat = event && event.userLat ? Number(event.userLat) : null;
  const userLng = event && event.userLng ? Number(event.userLng) : null;
  const maxDistance = event && event.maxDistance ? Number(event.maxDistance) : null; // 最大距离(公里)

  // 构建查询条件
  let whereConditions = {};
  
  // 关键词搜索
  if (keyword) {
    whereConditions = _.or([
      { name: new RegExp(keyword, 'i') },
      { address: new RegExp(keyword, 'i') },
      { tags: new RegExp(keyword, 'i') }
    ]);
  }
  
  // 评分筛选
  if (minRating) {
    whereConditions['rating.overall'] = _.gte(minRating);
  }
  
  // 价格筛选
  if (maxPrice) {
    whereConditions['minPrice'] = _.lte(maxPrice);
  }
  
  // 标签筛选
  if (tags && Array.isArray(tags) && tags.length > 0) {
    whereConditions['tags'] = _.in(tags);
  }

  // 构建查询
  let query = db.collection('stores');
  
  if (Object.keys(whereConditions).length > 0) {
    query = query.where(whereConditions);
  }

  // 字段选择
  query = query.field({
    _id: true,
    name: true,
    address: true,
    phone: true,
    cover: true,
    tags: true,
    businessHours: true,
    location: true,
    rating: true,
    minPrice: true,
    description: true
  });

  // 排序
  if (sortBy === 'rating') {
    query = query.orderBy('rating.overall', 'desc');
  } else {
    // 默认按创建时间
    query = query.orderBy('createdAt', 'desc');
  }

  // 分页
  if (shouldUseEffectivePrice) {
    query = query.limit(500);
  } else {
    query = query.skip((safePage - 1) * safeSize).limit(safeSize);
  }

  // 执行查询
  const res = await query.get();
  let stores = res.data || [];

  // 价格排序/筛选：优先使用门店 minPrice，缺失时回退到服务最低价。
  if (shouldUseEffectivePrice) {
    const priceList = await Promise.all(
      stores.map(async (store) => {
        const effectiveMinPrice = await resolveEffectiveMinPrice(db, store);
        return {
          ...store,
          minPrice: effectiveMinPrice !== null ? effectiveMinPrice : (store && store.minPrice)
        };
      })
    );
    stores = priceList;
    if (maxPrice) {
      stores = stores.filter((store) => {
        const p = toFiniteNumber(store && store.minPrice);
        return p !== null && p <= maxPrice;
      });
    }
    if (sortBy === 'price') {
      stores.sort((a, b) => {
        const pa = toFiniteNumber(a && a.minPrice);
        const pb = toFiniteNumber(b && b.minPrice);
        if (pa === null && pb === null) return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
        if (pa === null) return 1;
        if (pb === null) return -1;
        if (pa !== pb) return pa - pb;
        return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
      });
    }
    stores = stores.slice((safePage - 1) * safeSize, safePage * safeSize);
  }

  // 计算距离并筛选
  if (userLat && userLng) {
    stores = stores.map(store => {
      const distance = store.location && store.location.lat && store.location.lng
        ? calculateDistance(userLat, userLng, store.location.lat, store.location.lng)
        : null;
      return { ...store, distance };
    });

    // 距离筛选
    if (maxDistance) {
      stores = stores.filter(store => store.distance !== null && store.distance <= maxDistance);
    }

    // 按距离排序
    if (sortBy === 'distance') {
      stores.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }
  }

  return stores;
});
