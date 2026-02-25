/**
 * aftersales-store-list 云函数 —— 门店售后工单列表
 *
 * 【业务说明】
 * 返回当前管理员所属门店的全部售后工单，支持按状态筛选（OPEN/PROCESSING/RESOLVED/REJECTED）。
 * 前端售后管理页面使用此接口来渲染工单列表，管理员可逐条点入处理。
 *
 * 【权限】
 * - 仅 admin 角色可访问
 * - 查询范围自动限定为管理员所属门店（admin.storeId）
 */
const { withResponse, requireRole } = require('sb-common');

// 兼容中英文状态值：前端可能传中文（"待处理"）或英文枚举（"OPEN"），均归一化为统一枚举
// 传入空字符串或 "ALL" 时返回空字符串表示"不过滤状态"
function normalizeAftersaleStatus(status) {
  const raw = String(status || '').trim().toUpperCase();
  if (!raw || raw === 'ALL' || raw === '全部') return '';
  if (raw === 'OPEN' || raw === '待处理') return 'OPEN';
  if (raw === 'PROCESSING' || raw === '处理中') return 'PROCESSING';
  if (raw === 'RESOLVED' || raw === '已解决') return 'RESOLVED';
  if (raw === 'REJECTED' || raw === '未通过') return 'REJECTED';
  return '';
}

// 门店售后列表：按门店与状态筛选
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const status = normalizeAftersaleStatus(event && event.status);

  const db = uniCloud.database();
  const _ = db.command;
  // 管理员仅查看自己门店数据
  const where = { storeId: admin.storeId || '' };
  if (status) {
    where.status = status;
  }

  // 仅返回列表页所需字段
  const res = await db
    .collection('aftersales')
    .where(where)
    .field({
      orderId: true,
      type: true,
      status: true,
      content: true,
      reply: true,
      createdAt: true,
      updatedAt: true
    })
    .orderBy('createdAt', 'desc')
    .get();

  const list = (res && res.data) || [];
  // 批量提取关联订单，避免逐条查询导致 N+1 问题
  const orderIds = Array.from(new Set(list.map((item) => item && item.orderId).filter((id) => !!id)));
  let orderNoMap = new Map();
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
    const orderList = (orderRes && orderRes.data) || [];
    orderNoMap = new Map(orderList.map((item) => [item && item._id, item]));
  }

  // 回填订单快照字段，供管理端列表直接展示“订单/服务/时段”信息
  return list.map((item) => {
    const order = orderNoMap.get(item && item.orderId) || {};
    return {
      ...item,
      orderNo: order.orderNo || '',
      serviceName: order.serviceName || '',
      serviceId: order.serviceId || '',
      date: order.date || '',
      startTime: order.startTime || '',
      endTime: order.endTime || '',
      status: normalizeAftersaleStatus(item && item.status) || String((item && item.status) || '').toUpperCase()
    };
  });
});
