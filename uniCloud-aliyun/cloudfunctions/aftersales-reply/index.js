const { withResponse, ApiError, requireRole } = require('sb-common');

function normalizeAftersaleStatus(status) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'OPEN' || raw === 'PROCESSING' || raw === 'RESOLVED' || raw === 'REJECTED') return raw;
  return 'PROCESSING';
}

function buildAftersaleProgressMessage(status, reply) {
  const replyText = String(reply || '').trim();
  const map = {
    OPEN: {
      title: '售后状态更新：待处理',
      content: '您的售后工单已进入待处理队列。'
    },
    PROCESSING: {
      title: '售后状态更新：处理中',
      content: '您的售后工单正在处理中，请耐心等待。'
    },
    RESOLVED: {
      title: '售后状态更新：已解决',
      content: '您的售后工单已处理完成。'
    },
    REJECTED: {
      title: '售后状态更新：未通过',
      content: '您的售后工单未通过，请查看处理说明。'
    }
  };
  const fallback = map.PROCESSING;
  const picked = map[status] || fallback;
  if (replyText) {
    return {
      title: picked.title,
      content: `${picked.content} 处理说明：${replyText}`
    };
  }
  return picked;
}

// 门店处理售后：回复并更新状态
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);

  const id = (event && event.id) || '';
  const reply = (event && event.reply) || '';
  const status = normalizeAftersaleStatus((event && event.status) || 'PROCESSING');

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
          type: 'arrival_reminder',
          ...buildAftersaleProgressMessage(status, reply),
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
