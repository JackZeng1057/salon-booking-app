// 短信验证码校验：仅验证有效性，不做登录
// 引入统一响应包装
const { withResponse, ApiError } = require('sb-common');

/**
 * 验证短信验证码
 */
exports.main = withResponse(async (event, context) => {
  const phone = event && event.phone;
  const code = event && event.code;
  const type = (event && event.type) || 'reset_password';

  // 参数验证
  if (!phone || !code) {
    throw new ApiError(400, 'phone and code are required');
  }

  const db = uniCloud.database();
  const now = Date.now();

  // 查询验证码
  const codeRes = await db.collection('sms_codes')
    .where({
      phone,
      code,
      type,
      used: false,
      expiresAt: db.command.gt(now) // 未过期
    })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!codeRes.data || codeRes.data.length === 0) {
    throw new ApiError(400, '验证码错误或已过期');
  }

  // 验证通过
  return {
    valid: true,
    message: '验证码正确'
  };
});
