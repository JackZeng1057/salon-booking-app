/**
 * aftersales-mine-list 云函数 —— 用户售后工单列表
 *
 * 【业务说明】
 * 返回当前用户提交过的售后申请，按提交时间倒序，支持分页。
 * 同时拼接订单快照（订单号、服务项目、预约时间）供前端列表直接展示。
 *
 * 【权限】
 * - 仅 user 角色可访问
 */
const { withResponse, requireRole } = require('sb-common');

exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 10;

  const db = uniCloud.database();
  const _ = db.command;
  const userId = user._id || user.uid || user.userId;

  const res = await db
    .collection('aftersales')
    .where({ userId })
    .field({
      _id: true,
      orderId: true,
      type: true,
      status: true,
      content: true,
      reply: true,
      createdAt: true,
      updatedAt: true
    })
    .orderBy('createdAt', 'desc')
    .skip((safePage - 1) * safeSize)
    .limit(safeSize)
    .get();

  const list = (res && res.data) || [];
  // 批量回查订单快照，避免前端再额外请求订单详情
  const orderIds = Array.from(new Set(list.map((item) => item && item.orderId).filter((id) => !!id)));

  let orderMap = new Map();
  if (orderIds.length > 0) {
    const orderRes = await db
      .collection('orders')
      .where({ _id: _.in(orderIds) })
      .field({
        _id: true,
        orderNo: true,
        serviceName: true,
        serviceId: true,
        date: true,
        startTime: true,
        endTime: true
      })
      .get();

    orderMap = new Map(((orderRes && orderRes.data) || []).map((item) => [item && item._id, item]));
  }

  return {
    page: safePage,
    pageSize: safeSize,
    // 按当前页结果长度估算是否可能还有下一页，前端据此决定是否继续触底加载
    hasMore: list.length >= safeSize,
    list: list.map((item) => {
      const order = orderMap.get(item && item.orderId) || {};
      return {
        ...item,
        orderNo: order.orderNo || '',
        serviceName: order.serviceName || '',
        serviceId: order.serviceId || '',
        date: order.date || '',
        startTime: order.startTime || '',
        endTime: order.endTime || ''
      };
    })
  };
});
