const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 创建售后工单：仅订单所属用户可提交
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const type = (event && event.type) || '';
  const content = (event && event.content) || '';

  if (!orderId || !type) {
    throw new ApiError(400, 'orderId and type required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      storeId: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const now = Date.now();
  const res = await db.collection('aftersales').add({
    orderId,
    userId,
    storeId: order.storeId,
    type,
    content,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now
  });

  const aftersaleId = res.id || (res.ids && res.ids[0]) || '';

  // 通知店家处理售后（失败不影响主流程）
  try {
    const adminRes = await db
      .collection('users')
      .where({ role: 'admin', storeId: order.storeId })
      .field({ _id: true })
      .get();
    const admins = adminRes.data || [];
    for (let i = 0; i < admins.length; i += 1) {
      const admin = admins[i] || {};
      const adminId = admin._id || '';
      if (!adminId) continue;
      await uniCloud.callFunction({
        name: 'notifications-create',
        data: {
          userId: adminId,
          type: 'reschedule',
          title: '售后待处理',
          content: `有新的售后申请，请及时处理。工单类型：${type}。`,
          relatedId: aftersaleId,
          relatedType: 'aftersale'
        }
      });
    }
  } catch (err) {
    console.error('send aftersales-create notification error:', err);
  }

  return { id: aftersaleId };
});
