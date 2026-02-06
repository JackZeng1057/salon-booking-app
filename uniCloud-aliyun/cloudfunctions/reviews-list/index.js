// 引入统一响应包装
const { withResponse } = require('sb-common');

/**
 * 获取门店评价列表
 * 支持筛选: 最新/好评/差评/有图
 */
exports.main = withResponse(async (event, context) => {
  const db = uniCloud.database();
  const _ = db.command;

  // 必需参数
  const storeId = event && event.storeId;
  if (!storeId) {
    const err = new Error('storeId is required');
    err.code = 400;
    throw err;
  }

  // 分页参数
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 20);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;

  // 筛选类型：all（全部）/ good（好评）/ bad（差评）/ withImages（有图）
  const filterType = (event && event.filterType) || 'all';

  // 构建查询条件
  let whereConditions = { storeId };

  // 筛选逻辑
  if (filterType === 'good') {
    // 好评: 综合评分 >= 4
    whereConditions['rating.overall'] = _.gte(4);
  } else if (filterType === 'bad') {
    // 差评: 综合评分 < 3
    whereConditions['rating.overall'] = _.lt(3);
  } else if (filterType === 'withImages') {
    // 有图评价
    whereConditions['images'] = _.size(_.gt(0));
  }

  // 构建查询
  let query = db.collection('reviews').where(whereConditions);

  // 字段选择
  query = query.field({
    orderId: true,
    userId: true,
    userName: true,
    barberId: true,
    rating: true,
    content: true,
    images: true,
    helpful: true,
    reply: true,
    createdAt: true
  });

  // 排序: 最新优先
  query = query.orderBy('createdAt', 'desc');

  // 分页
  query = query.skip((safePage - 1) * safeSize).limit(safeSize);

  // 执行查询
  const res = await query.get();

  return {
    list: res.data || [],
    page: safePage,
    pageSize: safeSize,
    total: res.data ? res.data.length : 0
  };
});
