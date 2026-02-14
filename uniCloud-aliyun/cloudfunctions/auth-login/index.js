// 登录接口：校验账号密码并签发令牌
// 引入 Node.js 加密模块
const crypto = require('crypto');
// 引入统一响应包装、错误类型与错误码常量
const { withResponse, ApiError, ERROR_CODES } = require('sb-common');

// 与注册保持一致的摘要算法
function hashPassword(password) {
  // 创建 sha256 哈希并生成十六进制摘要
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 生成随机令牌作为登录会话
function createToken() {
  // 生成随机字节并转为十六进制字符串
  return crypto.randomBytes(24).toString('hex');
}

// 登录：校验账号密码 -> 写入令牌表 -> 返回令牌与用户基础信息
exports.main = withResponse(async (event, context) => {
  // 从入参读取用户名，若不存在则使用空字符串兜底
  const username = (event && event.username) || '';
  // 从入参读取密码，若不存在则使用空字符串兜底
  const password = (event && event.password) || '';

  // 校验用户名和密码是否齐全
  if (!username || !password) {
    // 抛出统一错误：参数不可处理（缺少用户名或密码）
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username and password required');
  }

  // 获取数据库操作实例
  const db = uniCloud.database();
  // 根据用户名查询用户记录
  const userRes = await db.collection('users').where({ username }).limit(1).get();
  // 取出查询到的第一条用户记录
  const user = userRes.data && userRes.data[0];
  // 校验用户是否存在以及密码是否匹配
  if (!user || user.passwordHash !== hashPassword(password)) {
    // 抛出统一错误：账号或密码错误
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'invalid credentials');
  }

  // 生成新的登录令牌
  const token = createToken();
  // 计算令牌过期时间（7 天后）
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  // 将令牌信息写入 auth_tokens 集合
  await db.collection('auth_tokens').add({
    // 关联用户 id
    userId: user._id,
    // 保存令牌字符串
    token,
    // 保存创建时间戳
    createdAt: Date.now(),
    // 保存过期时间戳
    expiresAt
  });

  // 返回令牌与用户基础信息
  return {
    // 返回令牌字符串
    token,
    // 返回用户基础信息对象
    user: {
      // 返回用户 id
      _id: user._id,
      // 返回用户名
      username: user.username,
      // 返回角色（缺省为 user）
      role: user.role || 'user',
      // 返回门店 ID（理发师/店家需要）
      storeId: user.storeId || '',
      // 返回绑定手机号
      phone: user.phone || '',
      // 返回显示昵称
      name: user.name || '',
      // 返回头像
      avatar: user.avatar || ''
    }
  };
});
