// 店家查看理发师申请列表（仅本店）
const { withResponse, requireRole, ApiError, ERROR_CODES } = require('sb-common');

function normalizeStatus(raw) {
  const text = String(raw || '').trim().toUpperCase();
  if (!text) return 'PENDING';
  if (text === 'ALL') return 'ALL';
  if (['PENDING', 'APPROVED', 'REJECTED'].includes(text)) return text;
  return 'PENDING';
}

exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const storeId = String((admin && admin.storeId) || '').trim();
  if (!storeId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'storeId required');
  }

  const page = Number((event && event.page) || 1);
  const pageSize = Number((event && event.pageSize) || 20);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;
  const status = normalizeStatus(event && event.status);

  const db = uniCloud.database();
  const where = {
    storeId,
    pendingRole: 'barber'
  };
  if (status !== 'ALL') {
    where.approvalStatus = status;
  }

  const [listRes, pendingCountRes] = await Promise.all([
    db
      .collection('users')
      .where(where)
      .field({
        _id: true,
        username: true,
        name: true,
        avatar: true,
        phone: true,
        role: true,
        storeId: true,
        pendingRole: true,
        approvalStatus: true,
        approvalReason: true,
        createdAt: true,
        approvedAt: true,
        rejectedAt: true
      })
      .orderBy('createdAt', 'desc')
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .get(),
    db
      .collection('users')
      .where({
        storeId,
        pendingRole: 'barber',
        approvalStatus: 'PENDING'
      })
      .count()
  ]);

  return {
    list: (listRes && listRes.data) || [],
    pendingCount: (pendingCountRes && pendingCountRes.total) || 0,
    page: safePage,
    pageSize: safeSize,
    status
  };
});
