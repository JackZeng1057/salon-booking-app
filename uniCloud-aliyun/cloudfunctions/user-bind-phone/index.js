/**
 * user-bind-phone 云函数 —— 登录用户绑定/修改手机号
 *
 * 【业务流程】
 *   ① 输入新手机号与验证码（由 sms-send-code 发送）
 *   ② 校验验证码合法性及月过期时间
 *   ③ 检查手机号是否已被其他账号占用（防冲突）
 *   ④ 更新用户 phone 字段
 *   ⑤ 将验证码标记为已使用，防止重放
 *
 * 【注意】
 * 复用 sms_codes.type='login'，避免修改 schema 枚举列添加新类型。
 *
 * 【权限】
 * - 需要登录（requireLogin）
 */
const { withResponse, ApiError, ERROR_CODES, requireLogin } = require('sb-common');

// 校验中国大陆手机号格式：11 位，以 1 开头，第二位 3-9
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

// 绑定手机号：登录用户提交手机号 + 验证码
// 注意：为避免修改 sms_codes.schema 的 type 枚举，复用 type=login
exports.main = withResponse(async (event, context) => {
  const user = await requireLogin(event, context);

  const phone = (event && event.phone) || '';
  const code = (event && event.code) || '';
  const type = (event && event.type) || 'login';

  if (!phone || !code) {
    throw new ApiError(400, 'phone and code are required');
  }
  if (!isValidPhone(phone)) {
    throw new ApiError(400, 'invalid phone number');
  }

  const db = uniCloud.database();
  const now = Date.now();
  const userId = user._id || user.uid || user.userId;

  // 校验验证码
  const codeRes = await db.collection('sms_codes')
    .where({
      phone,
      code,
      type,
      used: false,
      expiresAt: db.command.gt(now)
    })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  const smsCode = codeRes.data && codeRes.data[0];
  if (!smsCode) {
    throw new ApiError(400, '验证码错误或已过期');
  }

  // 防止手机号被其他账号占用
  const existedRes = await db.collection('users')
    .where({ phone })
    .limit(1)
    .get();
  const existed = existedRes.data && existedRes.data[0];
  if (existed && existed._id !== userId) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'phone already bound');
  }

  // 更新用户手机号
  await db.collection('users').doc(userId).update({
    phone,
    updatedAt: now
  });

  // 标记验证码已使用
  await db.collection('sms_codes').doc(smsCode._id).update({
    used: true
  });

  // 账号安全通知（失败不影响主流程）
  try {
    await uniCloud.callFunction({
      name: 'notifications-create',
      data: {
        userId,
        type: 'arrival_reminder',
        title: '账号安全提醒',
        content: `您的账号已绑定手机号 ${phone}。如非本人操作，请尽快修改密码。`,
        relatedId: userId,
        relatedType: 'order'
      }
    });
  } catch (err) {
    console.error('send bind-phone notification error:', err);
  }

  return {
    phone
  };
});
