// 短信验证码发送：演示环境返回验证码，生产环境走短信服务
// 引入统一响应包装
const { withResponse, ApiError } = require('sb-common');

/**
 * 发送验证码
 * 演示版：返回验证码供前端显示
 * 生产版：调用短信服务发送
 */
exports.main = withResponse(async (event, context) => {
  const phone = event && event.phone;
  const type = (event && event.type) || 'reset_password'; // reset_password（重置密码）/ register（注册）/ login（登录）

  // 验证手机号
  if (!phone) {
    throw new ApiError(400, 'phone is required');
  }

  // 简单的手机号格式验证
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    throw new ApiError(400, 'invalid phone number');
  }

  const db = uniCloud.database();
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5分钟后过期

  // 检查是否频繁发送（1分钟内只能发送一次）
  const recentCode = await db.collection('sms_codes')
    .where({
      phone,
      type,
      createdAt: db.command.gt(now - 60 * 1000) // 1分钟内
    })
    .limit(1)
    .get();

  if (recentCode.data && recentCode.data.length > 0) {
    throw new ApiError(429, '发送过于频繁，请稍后再试');
  }

  // 生成6位数字验证码
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // 保存验证码到数据库
  await db.collection('sms_codes').add({
    phone,
    code,
    type,
    expiresAt,
    used: false,
    createdAt: now
  });

  // ===== 演示版本：直接返回验证码 =====
  // 开发和演示环境使用，方便测试和答辩演示
  const isDevelopment = true; // 演示模式

  if (isDevelopment) {
    return {
      success: true,
      message: '验证码已生成（演示模式）',
      code: code, // 演示模式返回验证码供前端显示
      expiresIn: 300 // 5分钟
    };
  }

  // ===== 生产版本：调用短信服务 =====
  // 需要企业资质认证后启用
  // 切换方法：将上面 isDevelopment 改为 false，并配置短信服务参数
  /*
  try {
    // 调用 uniCloud 短信服务
    const smsResult = await uniCloud.sendSms({
      smsKey: 'your_sms_key', // 在 uniCloud 控制台获取
      smsSecret: 'your_sms_secret',
      phone: phone,
      templateId: 'your_template_id', // 短信模板ID
      data: {
        code: code,
        expire: '5'
      }
    });

    if (smsResult.errCode !== 0) {
      throw new Error('短信发送失败');
    }

    return {
      success: true,
      message: '验证码已发送',
      expiresIn: 300
    };
  } catch (err) {
    console.error('SMS send error:', err);
    throw new ApiError(500, '验证码发送失败，请稍后重试');
  }
  */

  return {
    success: true,
    message: '验证码已发送（演示环境）',
    expiresIn: 300
  };
});
