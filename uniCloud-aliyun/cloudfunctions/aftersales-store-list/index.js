const { withResponse, requireRole } = require('sb-common');

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
      reply: true,
      createdAt: true,
      updatedAt: true
    })
    .orderBy('createdAt', 'desc')
    .get();

  const list = (res && res.data) || [];
  return list.map((item) => ({
    ...item,
    status: normalizeAftersaleStatus(item && item.status) || String((item && item.status) || '').toUpperCase()
  }));
});
