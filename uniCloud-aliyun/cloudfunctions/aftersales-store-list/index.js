const { withResponse, requireRole } = require('sb-common');

// 门店售后列表：按门店与状态筛选
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const status = (event && event.status) || '';

  const db = uniCloud.database();
  const where = { storeId: admin.storeId || '' };
  if (status) {
    where.status = status;
  }

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
