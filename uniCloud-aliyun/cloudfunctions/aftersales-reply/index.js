/**
 * aftersales-reply 云函数 —— 门店管理员处理售后工单
 *
 * 【业务说明】
 * 管理员在售后管理页查看工单后，可填写回复内容并更新工单状态。
 * 状态流转路径：OPEN → PROCESSING → RESOLVED / REJECTED
 *
 * 【权限与校验】
 * - 仅 admin 角色可调用
 * - 门店隔离：管理员只能处理本店发起的售后工单
 *
 * 【通知策略】
 * 状态更新后自动推送进度通知给用户（fire-and-forget）。
 */
const { withResponse, ApiError, requireRole } = require('sb-common');

// 标准化售后状态：仅允许固定枚举，非法值回退 PROCESSING 防止写入异常状态。
function normalizeAftersaleStatus(status) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'OPEN' || raw === 'PROCESSING' || raw === 'RESOLVED' || raw === 'REJECTED') return raw;
  return 'PROCESSING';
}

// 根据状态和回复内容生成通知文案，统一用户侧消息体验。
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
// 主流程：
// 1) 校验管理员权限与工单归属门店；
// 2) 更新售后状态与回复；
// 3) 通知用户“售后进度更新”（通知失败不影响主流程）。
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

  // 门店隔离：管理员只能处理自己门店的售后工单。
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
