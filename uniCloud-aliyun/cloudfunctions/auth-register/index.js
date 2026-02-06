// 注册接口：校验用户信息并创建账号
// 引入 Node.js 加密模块
const crypto = require('crypto');
// 引入统一响应包装、错误类型与错误码常量
const { withResponse, ApiError, ERROR_CODES } = require('sb-common');

// 使用 sha256 生成密码摘要（示例用，生产可换更安全方案）
function hashPassword(password) {
  // 创建 sha256 哈希并生成十六进制摘要
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 只允许三种角色，其他一律降级为 user
function normalizeRole(role) {
  // 定义允许的角色列表
  const allowed = ['user', 'barber', 'admin'];
  // 如果角色合法则返回原值，否则降级为 user
  return allowed.includes(role) ? role : 'user';
}

// 注册账号：校验参数 -> 判断重名 -> 写入 users
exports.main = withResponse(async (event, context) => {
  // 从入参读取用户名，若不存在则使用空字符串兜底
  const username = (event && event.username) || '';
  // 从入参读取密码，若不存在则使用空字符串兜底
  const password = (event && event.password) || '';
  // 从入参读取角色并进行合法化处理
  const role = normalizeRole((event && event.role) || 'user');
  // 可选：店铺ID（admin/barber 需要绑定）
  const storeId = (event && event.storeId) || '';

  // 校验用户名和密码是否齐全
  if (!username || !password) {
    // 抛出统一错误：参数不可处理（缺少用户名或密码）
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username and password required');
  }

  // 获取数据库操作实例
  const db = uniCloud.database();
  // 查询是否已存在相同用户名
  const existed = await db.collection('users').where({ username }).limit(1).get();
  // 若已存在用户名则抛出冲突错误
  if (existed.data && existed.data.length > 0) {
    // 抛出统一错误：用户名已存在
    throw new ApiError(ERROR_CODES.CONFLICT, 'username already exists');
  }

  // 若是 admin/barber，要求提供 storeId
  if ((role === 'admin' || role === 'barber') && !storeId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'storeId required');
  }

  // 若是 admin，则限制同一店铺只有一个管理员
  if (role === 'admin') {
    const existedAdmin = await db
      .collection('users')
      .where({ role: 'admin', storeId })
      .limit(1)
      .get();
    if (existedAdmin.data && existedAdmin.data.length > 0) {
      throw new ApiError(ERROR_CODES.CONFLICT, 'admin already exists for this store');
    }
  }

  // 向 users 集合写入新的用户记录
  const userRes = await db.collection('users').add({
    // 保存用户名
    username,
    // 保存加密后的密码摘要
    passwordHash: hashPassword(password),
    // 保存角色信息
    role,
    // 绑定店铺（user 可为空）
    storeId: storeId || '',
    // 保存创建时间戳
    createdAt: Date.now()
  });

  // 返回注册成功后的关键信息
  return {
    // 返回新用户 id（兼容不同返回结构）
    userId: userRes.id || (userRes.data && userRes.data[0] && userRes.data[0]._id) || '',
    // 返回用户名
    username,
    // 返回角色
    role
  };
});
