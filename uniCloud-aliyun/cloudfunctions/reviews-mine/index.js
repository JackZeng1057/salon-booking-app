/**
 * reviews-mine 云函数 —— 查询当前用户的评价列表
 *
 * 【业务说明】
 * 返回当前登录用户提交过的所有评价，支持分页加载。
 * 评价主表字段不包含订单快照，有需要时会批量关联查询订单表进行数据拼接。
 *
 * 【权限】
 * - 仅 user 角色可访问
 */
const { withResponse, requireRole } = require('sb-common');

// 获取当前用户的评价列表（含订单快照信息）
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  // 分页参数保护：页码>=1，pageSize 最大 20
  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 10;

  const db = uniCloud.database();
  const _ = db.command;
  const userId = user._id || user.uid || user.userId;

  // 先查评价主表
  const reviewRes = await db
    .collection('reviews')
    .where({ userId })
    .field({
      _id: true,
      orderId: true,
      storeId: true,
      barberId: true,
      userName: true,
      rating: true,
      content: true,
      images: true,
      helpful: true,
      reply: true,
      createdAt: true
    })
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safeSize)
    .limit(safeSize)
    .get();

  const reviews = reviewRes.data || [];
  // 收集关联订单 ID，批量查询订单快照字段
  const orderIds = Array.from(new Set(reviews.map((item) => item.orderId).filter(Boolean)));

  let orderMap = new Map();
  if (orderIds.length > 0) {
    const orderRes = await db
      .collection('orders')
      .where({ _id: _.in(orderIds) })
      .field({
        _id: true,
        orderNo: true,
        storeName: true,
        serviceName: true,
        barberName: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true
      })
      .get();

    orderMap = new Map((orderRes.data || []).map((item) => [item._id, item]));
  }

  // 组装前端所需展示字段
  const list = reviews.map((item) => {
    const order = orderMap.get(item.orderId) || {};
    return {
      ...item,
      orderNo: order.orderNo || '',
      storeName: order.storeName || '',
      serviceName: order.serviceName || '',
      barberName: order.barberName || '',
      date: order.date || '',
      startTime: order.startTime || '',
      endTime: order.endTime || '',
      orderStatus: order.status || ''
    };
  });

  return {
    page: safePage,
    pageSize: safeSize,
    hasMore: list.length >= safeSize,
    list
  };
});
