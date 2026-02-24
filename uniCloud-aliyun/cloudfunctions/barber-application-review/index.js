/**
 * @file barber-application-review/index.js — 理发师申请审核云函数
 *
 * 【业务定位】
 * 处理门店管理员对理发师申请的审批操作（通过 / 拒绝），
 * 是理发师角色激活流程的最终决策节点。
 * 前置：用户注册时选择角色 barber，提交门店申请（approvalStatus=PENDING）；
 * 本函数：管理员审核通过后，用户角色正式升级为 barber 并绑定门店。
 *
 * 【审核动作归一化（normalizeAction）】
 * 为宽容不同调用方命名习惯，同时支持：
 * - 通过：'approve' | 'pass' → 内部标准 'APPROVE'
 * - 拒绝：'reject'  | 'deny' → 内部标准 'REJECT'
 *
 * 【审核通过后的数据库变更】
 * 1. 将 users 表中目标用户的 role 字段从 guest/applicant 改为 'barber'；
 * 2. 清除 pendingRole 和 approvalStatus 等临时字段；
 * 3. 保留 storeId 绑定（注册时已写入），无需再次更新。
 *
 * 【审核拒绝后的数据库变更】
 * 1. 将 approvalStatus 更新为 'REJECTED'；
 * 2. 保留 pendingRole=barber，允许用户修改信息后重新提交申请；
 * 3. 可附带拒绝原因（reason 字段，最多 60 字）供前端展示。
 *
 * 【权限设计】
 * 仅允许 admin 角色调用，且必须操作与自身 storeId 相同的申请，
 * 服务端双重校验（requireRole + storeId 归属校验），防止越权审批。
 */
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
