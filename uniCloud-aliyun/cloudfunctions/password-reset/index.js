/**
 * password-reset 云函数 —— 通过手机号验证码重置密码
 *
 * 【业务流程】
 *   ① 输入手机号与短信验证码（由 sms-send-code 发送）
 *   ② 参数完整性校验：手机号、验证码、新密码均必填
 *   ③ 核查手机号是否已绑定到某个账号
 *   ④ 校验短信验证码是否有效且未过期
 *   ⑤ 更新 passwordHash（SHA-256 摘要）
 *   ⑥ 将验证码标记为已使用，防止重放攻击
 *
 * 【密码强度限制】
 * 新密码至少 6 位，backend 存储 SHA-256 摘要而非明文。
 *
 * 【权限】
 * 公开接口：无需登录（忘记密码场景）
 */
// 密码重置：校验短信验证码并更新密码摘要
const { withResponse, ApiError, hashPassword } = require('sb-common');

// 流程：验证手机号绑定 -> 校验短信验证码 -> 更新密码摘要 -> 标记验证码已使用
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

  // 3. 更新密码摘要（与 auth-login/auth-register 一致）
  await db.collection('users')
    .doc(user._id)
    .update({
      passwordHash: hashPassword(newPassword),
      updatedAt: now
    });

  // 4. 标记验证码为已使用
  await db.collection('sms_codes')
    .doc(smsCode._id)
    .update({
      used: true
    });

  // 账号安全通知（失败不影响主流程）
  try {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId: user._id,
        type: 'arrival_reminder',
        title: '密码已重置',
        content: '您的账号密码已重置成功。如非本人操作，请立即联系门店管理员。',
        relatedId: user._id,
        relatedType: 'order'
      }
    });
  } catch (err) {
    console.error('send password-reset notification error:', err);
  }

  return {
    success: true,
    message: '密码重置成功'
  };
});
