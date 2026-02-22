// 店家审核理发师申请（通过/拒绝）
const { withResponse, requireRole, ApiError, ERROR_CODES } = require('sb-common');

// 审核动作归一化：支持 approve/pass、reject/deny
function normalizeAction(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (text === 'approve' || text === 'pass') return 'APPROVE';
  if (text === 'reject' || text === 'deny') return 'REJECT';
  return '';
}

/**
 * 理发师申请审核云函数
 * 规则：
 * 1) 仅门店管理员可操作本店申请
 * 2) 通过后角色切换为 barber
 * 3) 拒绝后保留 pendingRole=barber，便于后续重新申请
 */
exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const adminId = admin._id || admin.uid || admin.userId || '';
  const storeId = String((admin && admin.storeId) || '').trim();
  if (!storeId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'storeId required');
  }

  const userId = String((event && event.userId) || '').trim();
  const action = normalizeAction(event && event.action);
  const reason = String((event && event.reason) || '').trim().slice(0, 60);

  if (!userId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'userId required');
  }
  if (!action) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'invalid action');
  }

  const db = uniCloud.database();
  const userRes = await db
    .collection('users')
    .doc(userId)
    .field({
      _id: true,
      username: true,
      name: true,
      role: true,
      storeId: true,
      pendingRole: true,
      approvalStatus: true
    })
    .get();
  const target = userRes && userRes.data && userRes.data[0];

  if (!target) {
    throw new ApiError(404, 'application not found');
  }
  if (target.storeId !== storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (target.pendingRole !== 'barber') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'application not found');
  }

  const now = Date.now();
  const isApprove = action === 'APPROVE';

  // 按审核结果生成更新字段
  const updateData = isApprove
    ? {
        role: 'barber',
        pendingRole: '',
        approvalStatus: 'APPROVED',
        approvalReason: '',
        approvedAt: now,
        approvedBy: adminId,
        rejectedAt: null,
        rejectedBy: ''
      }
    : {
        role: 'user',
        pendingRole: 'barber',
        approvalStatus: 'REJECTED',
        approvalReason: reason || '未通过审核',
        rejectedAt: now,
        rejectedBy: adminId
      };

  await db.collection('users').doc(userId).update(updateData);

  // 发送审核结果通知（失败不影响主流程）
  try {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'arrival_reminder',
        title: isApprove ? '理发师申请已通过' : '理发师申请未通过',
        content: isApprove
          ? '您的理发师账号已审核通过，重新登录后可进入理发师工作台。'
          : `您的理发师申请未通过${reason ? `：${reason}` : '，请联系门店管理员。'}`,
        relatedId: '',
        relatedType: 'system'
      }
    });
  } catch (err) {
    console.error('notify barber application review failed:', err);
  }

  return {
    success: true,
    action: isApprove ? 'APPROVED' : 'REJECTED',
    userId
  };
});
