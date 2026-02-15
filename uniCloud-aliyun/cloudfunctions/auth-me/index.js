// 登录态查询：返回当前用户基础信息（含 storeId）
// 引入统一响应包装与登录校验方法
const { withResponse, requireLogin } = require('sb-common');

// 获取当前登录用户信息（用于角色跳转）
exports.main = withResponse(async (event, context) => {
  // 校验登录并获取当前用户信息
  const user = await requireLogin(event, context);
  const userId = user._id || user.uid || user.userId || '';
  const db = uniCloud.database();

  let latest = null;
  if (userId) {
    const userRes = await db.collection('users').doc(userId).field({
      _id: true,
      username: true,
      role: true,
      storeId: true,
      phone: true,
      name: true,
      avatar: true,
      pendingRole: true,
      approvalStatus: true
    }).get();
    latest = userRes.data && userRes.data[0];
  }
  const target = latest || user;
  // 返回用户基础信息（兼容不同字段命名）
  return {
    // 用户唯一标识，按多种可能字段兜底
    _id: target._id || target.uid || target.userId || userId,
    // 用户名字段，若不存在则返回空字符串
    username: target.username || '',
    // 用户角色字段，若不存在则默认 user
    role: target.role || 'user',
    // 门店 ID（理发师/店家可能需要）
    storeId: target.storeId || '',
    // 绑定手机号（用于找回密码/通知）
    phone: target.phone || '',
    // 显示昵称
    name: target.name || '',
    // 头像地址
    avatar: target.avatar || '',
    // 待审核角色（如 barber）
    pendingRole: target.pendingRole || '',
    // 审核状态（PENDING/APPROVED/REJECTED）
    approvalStatus: target.approvalStatus || ''
  };
});
