/**
 * auth-login 云函数 —— 账号密码登录 & Token 签发
 *
 * 【认证方案设计说明】
 * 本系统没有使用 uniCloud 官方的 uni-id 内置认证体系，而是采用自定义 Token 方案。
 * 原因如下：
 *   1. uni-id 默认将用户表与认证逻辑高度耦合，难以在不改造框架的情况下实现
 *      本项目所需的多角色审批流（barber 需要 admin 审核才能切换 role）；
 *   2. 自定义 auth_tokens 集合结构简单清晰，便于在论文中完整描述认证流程；
 *   3. 支持未来扩展（如 refresh token、多设备踢出等），只需修改 auth_tokens 逻辑。
 *
 * 【完整登录流程】
 *   ① 客户端发送 { username, password } 给本云函数
 *   ② 校验入参非空
 *   ③ 按 username 在 users 集合精确查找
 *   ④ 将 hashPassword(password) 的计算结果与数据库存储的 passwordHash 比对
 *      （hashPassword 内部使用 SHA-256，密码不以明文保存）
 *   ⑤ 比对通过后调用 createToken() 生成 48 位随机十六进制串
 *   ⑥ 将 token 记录写入 auth_tokens 集合（含过期时间戳）
 *   ⑦ 将 token 和用户摘要返回给客户端
 *   ⑧ 客户端将 token 存入 uni.setStorageSync，后续每次调用云函数时附带
 *
 * 【安全设计：防用户枚举】
 * "用户不存在"和"密码错误"两种情况统一返回 401 + 'invalid credentials'，
 * 攻击者无法通过对比错误消息来判断某个账号是否在系统中注册，从而防止账号枚举攻击。
 *
 * 【Token 有效期设计】
 * 有效期设为 7 天，在安全性与用户体验之间取得平衡：
 * - 过短：用户需要频繁重新登录，体验差；
 * - 过长：token 泄露后窗口期长，安全风险增加。
 * 7 天对于频繁使用的预约 App 是合适的折中值。
 */
const crypto = require('crypto');
const { withResponse, ApiError, ERROR_CODES, hashPassword } = require('sb-common');

/**
 * 生成随机 Token（48 位十六进制字符串）
 * 使用 Node.js 内置 crypto 模块的 randomBytes，能产生加密安全的随机字节，
 * 碰撞概率约为 2^{-192}，远低于实际威胁阈值，不存在可预测性问题。
 */
function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * 登录主逻辑：入参校验 → 账号查询 → 密码比对 → Token 入库 → 返回凭证
 */
exports.main = withResponse(async (event, context) => {
  const username = (event && event.username) || '';
  const password = (event && event.password) || '';

  // 入参非空校验：username 和 password 均为必填
  if (!username || !password) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username and password required');
  }

  const db = uniCloud.database();
  // 按 username 精确查找用户（users.username 字段应在数据库建立唯一索引）。
  // limit(1) 防止异常情况下返回多条记录。
  const userRes = await db.collection('users').where({ username }).limit(1).get();
  const user = userRes.data && userRes.data[0];

  // 【安全】用户不存在与密码错误统一返回 401，防止攻击者通过不同错误消息枚举账号。
  // hashPassword 内部使用 SHA-256：passwordHash = SHA256(password)，数据库中不存明文。
  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'invalid credentials');
  }

  // 生成 Token 并写入 auth_tokens 集合。
  // auth_tokens 集合结构：{ userId, token, createdAt, expiresAt }
  // 使用独立集合而非直接存 users 的好处：支持多设备同时登录（一账号多 token），
  // 且可随时吊销指定设备的 token（删除对应文档即可强制下线）。
  const token = createToken();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 天后过期

  await db.collection('auth_tokens').add({
    userId: user._id,
    token,
    createdAt: Date.now(),
    expiresAt
  });

  // 返回 token 与用户摘要：
  // 前端收到后将 token 持久化到本地存储，后续请求携带；
  // 同时将 user 摘要存入 Vuex/store，直接完成角色路由，无需再调用 auth-me。
  return {
    token,
    user: {
      _id: user._id,
      username: user.username,
      role: user.role || 'user',
      storeId: user.storeId || '',     // 理发师/管理员后续门店操作的关键外键
      // 理发师可执行服务清单：前端用于排班页与预约口径判定
      serviceIds: Array.isArray(user.serviceIds) ? user.serviceIds : [],
      phone: user.phone || '',
      name: user.name || '',           // admin 角色此处存门店名，barber/user 存账号名
      avatar: user.avatar || '',
      pendingRole: user.pendingRole || '',         // 申请中的目标角色（如 barber）
      approvalStatus: user.approvalStatus || ''   // PENDING=审核中 / APPROVED=通过 / REJECTED=拒绝
    }
  };
});
