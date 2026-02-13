// 登录态查询：返回当前用户基础信息（含 storeId）
// 引入统一响应包装与登录校验方法
const { withResponse, requireLogin } = require('sb-common');

// 获取当前登录用户信息（用于角色跳转）
exports.main = withResponse(async (event, context) => {
  // 校验登录并获取当前用户信息
  const user = await requireLogin(event, context);
  // 返回用户基础信息（兼容不同字段命名）
  return {
    // 用户唯一标识，按多种可能字段兜底
    _id: user._id || user.uid || user.userId || '',
    // 用户名字段，若不存在则返回空字符串
    username: user.username || '',
    // 用户角色字段，若不存在则默认 user
    role: user.role || 'user',
    // 门店 ID（理发师/店家可能需要）
    storeId: user.storeId || '',
    // 绑定手机号（用于找回密码/通知）
    phone: user.phone || ''
  };
});
