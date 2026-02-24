/**
 * aftersales-create 云函数 —— 用户提交售后工单
 *
 * 【业务说明】
 * 用户在订单完成或出现问题后，可以针对该订单发起售后申请。
 * 每次申请创建一条 aftersales 文档（初始状态 OPEN），
 * 门店管理员在售后管理页处理后可流转为 PROCESSING / RESOLVED / REJECTED。
 *
 * 【权限与校验】
 * - 仅 user 角色可调用（requireRole）
 * - 只允许对自己名下的订单发起售后（订单归属校验）
 *
 * 【通知策略】
 * 工单创建成功后以 fire-and-forget 方式通知门店管理员与用户，
 * 通知失败不影响主流程返回，避免因通知服务异常导致用户提交失败。
 */
const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');

// 将售后类型编码转成中文文案，便于通知内容直出。
function formatAftersaleType(type) {
  const map = {
    SERVICE: '服务问题',
    NO_SHOW: '迟到/爽约',
    OTHER: '其他'
  };
  return map[String(type || '').toUpperCase()] || '售后问题';
}

// 创建售后工单：仅订单所属用户可提交
// 主流程：
// 1) 校验订单归属；
// 2) 写入 aftersales 工单；
// 3) 异步通知门店管理员和用户（通知失败不影响主流程）。
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

  // 读取订单归属关系，防止用户伪造 orderId 提交他人售后。
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
  // 权限控制：只能为自己的订单发起售后申请。
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  const now = Date.now();
  // 新工单默认 OPEN，后续由门店处理流转到 PROCESSING/CLOSED 等状态。
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

  // 通知店家处理售后（失败不影响主流程）：
  // 采用“主流程成功优先”策略，避免通知异常导致用户提交失败。
  try {
    const typeText = formatAftersaleType(type);
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
          type: 'arrival_reminder',
          title: '售后工单待处理',
          content: `收到新的售后工单（${typeText}），请及时处理。`,
          relatedId: aftersaleId,
          relatedType: 'aftersale'
        }
      });
    }

    // 给用户发送“已受理”确认通知，减少重复提交。
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'arrival_reminder',
        title: '售后申请已提交',
        content: `您的${typeText}售后申请已提交，我们会尽快处理。`,
        relatedId: aftersaleId,
        relatedType: 'aftersale'
      }
    });
  } catch (err) {
    // 通知链路异常只打日志，售后工单本身已成功创建。
    console.error('send aftersales-create notification error:', err);
  }

  // 返回工单 id，前端可跳转详情页并拉取处理进度。
  return { id: aftersaleId };
});
