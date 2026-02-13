const { withResponse, ApiError, requireRole } = require('sb-common');

// 门店处理售后：回复并更新状态
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);

  const id = (event && event.id) || '';
  const reply = (event && event.reply) || '';
  const status = (event && event.status) || 'PROCESSING';

  if (!id) {
    throw new ApiError(400, 'id required');
  }

  const db = uniCloud.database();
  // 仅取校验所需字段，减少读取量
  const afterRes = await db
    .collection('aftersales')
    .doc(id)
    .field({
      storeId: true,
      userId: true,
      orderId: true,
      type: true,
      content: true,
      status: true
    })
    .get();
  const after = afterRes.data && afterRes.data[0];
  if (!after) {
    throw new ApiError(404, 'aftersale not found');
  }

  if (admin.storeId && after.storeId !== admin.storeId) {
    throw new ApiError(403, 'forbidden');
  }

  const now = Date.now();
  await db.collection('aftersales').doc(id).update({
    reply,
    status,
    updatedAt: now
  });

  // 通知用户：售后有新进度（失败不影响主流程）
  try {
    if (after.userId) {
      await uniCloud.callFunction({
        name: 'notifications-create',
        data: {
          userId: after.userId,
          type: 'reschedule',
          title: '售后进度更新',
          content: reply || `您的售后申请状态已更新为：${status}`,
          relatedId: id || after.orderId || '',
          relatedType: 'aftersale'
        }
      });
    }
  } catch (err) {
    console.error('send aftersales-reply notification error:', err);
  }

  // 直接拼装返回，避免二次读取
  return {
    aftersale: {
      ...after,
      reply,
      status,
      updatedAt: now
    }
  };
});
