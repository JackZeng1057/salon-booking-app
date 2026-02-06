// 密码重置：校验短信验证码并更新密码
// 引入统一响应包装
const { withResponse, ApiError } = require('sb-common');

/**
 * 验证验证码并重置密码
 */
exports.main = withResponse(async (event, context) => {
  const phone = event && event.phone;
  const code = event && event.code;
  const newPassword = event && event.newPassword;

  // 参数验证
  if (!phone || !code || !newPassword) {
    throw new ApiError(400, 'phone, code, and newPassword are required');
  }

  // 密码强度验证（至少6位）
  if (newPassword.length < 6) {
    throw new ApiError(400, '密码长度至少6位');
  }

  const db = uniCloud.database();
  const now = Date.now();

  // 1. 验证手机号是否存在
  const userRes = await db.collection('users')
    .where({ phone })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    throw new ApiError(404, '该手机号未注册');
  }

  const user = userRes.data[0];

  // 2. 验证验证码
  const codeRes = await db.collection('sms_codes')
    .where({
      phone,
      code,
      type: 'reset_password',
      used: false,
      expiresAt: db.command.gt(now) // 未过期
    })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!codeRes.data || codeRes.data.length === 0) {
    throw new ApiError(400, '验证码错误或已过期');
  }

  const smsCode = codeRes.data[0];

  // 3. 更新密码（实际项目中应该加密存储）
  await db.collection('users')
    .doc(user._id)
    .update({
      password: newPassword,
      updatedAt: now
    });

  // 4. 标记验证码为已使用
  await db.collection('sms_codes')
    .doc(smsCode._id)
    .update({
      used: true
    });

  return {
    success: true,
    message: '密码重置成功'
  };
});
