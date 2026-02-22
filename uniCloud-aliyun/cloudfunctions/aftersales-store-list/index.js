const { withResponse, requireRole } = require('sb-common');

// 门店售后列表：按门店与状态筛选
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const status = (event && event.status) || '';

  const db = uniCloud.database();
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
      type: true,
      status: true,
      content: true,
      reply: true
    })
    .orderBy('createdAt', 'desc')
    .get();

  return res.data || [];
});
