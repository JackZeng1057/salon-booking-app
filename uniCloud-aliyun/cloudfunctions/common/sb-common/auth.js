/**
 * auth.js —— 登录校验与角色鉴权工具
 *
 * 【认证流程概述】
 * 本系统使用自定义 Token 方案（详见 auth-login 云函数）：
 *   登录 → 写入 auth_tokens 集合 → 客户端存 token → 后续请求携带 token
 *
 * 本模块负责"后续请求"阶段的 token 验证，主要导出两个中间件函数：
 *
 *   requireLogin(event, context)
 *     验证调用方是否已登录，返回用户对象。
 *     各云函数在业务逻辑前调用，未登录时直接抛出 401。
 *
 *   requireRole(roles, event, context)
 *     在 requireLogin 基础上进一步检查角色，
 *     角色不匹配时抛出 403（已登录但无权限）。
 *
 * 【Token 验证的两条路径】
 *   路径 A（context.auth）：uniCloud 某些情况会在 context 中注入已解析的用户信息，
 *     此时可跳过数据库查询直接使用，速度更快。
 *   路径 B（event.token）：从请求体或 Authorization 请求头读取 token，
 *     再查 auth_tokens 集合验证是否有效（未过期 + 能关联到用户）。
 *   当路径 A 有效时优先使用；否则走路径 B，二者均失败则返回 401。
 *
 * 【auth_tokens 集合结构】
 *   { _id, userId, token, createdAt, expiresAt }
 *   expiresAt 为毫秒时间戳，与 Date.now() 比较判断是否过期。
 */
const { ApiError, ERROR_CODES } = require('./errors');

/**
 * 尝试从 context 中读取平台注入的用户信息。
 * uniCloud 在处理某些鉴权场景时会自动解析 token 并注入，字段名因版本而异，
 * 依次尝试 auth / user / userInfo / USERINFO 以兼容不同版本。
 */
function getAuthUser(context) {
  if (!context) return null;
  return context.auth || context.user || context.userInfo || context.USERINFO || null;
}

/**
 * 从请求中提取 token 字符串，支持两种传递方式：
 *   1. event.token / event.accessToken（直接写在请求体里，本项目主要用这种）
 *   2. Authorization: Bearer <token>（HTTP 标准请求头，为兼容性预留）
 */
function getTokenFromEvent(event) {
  if (!event) return '';
  const direct = event.token || event.accessToken || '';
  if (direct) return direct;

  const headers = event.headers || event.header || {};
  const authHeader = headers.authorization || headers.Authorization || '';
  const m = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  return m ? m[1] : '';
}

/**
 * 统一兼容用户 ID 字段，
 * 平台注入对象用 uid，数据库文档用 _id，兼容写法用 userId。
 */
function normalizeUserId(user) {
  return (user && (user.uid || user._id || user.userId)) || '';
}

/**
 * 通过 token 字符串查询对应的用户信息。
 * 流程：
 *   1. 在 auth_tokens 中精确匹配 token 字段（token 应建立索引以加速查询）
 *   2. 验证 expiresAt 是否已过期
 *   3. 取出 userId，去 users 集合查完整用户对象并返回
 */
async function getUserByToken(token) {
  const db = uniCloud.database();

  const tokenRes = await db
    .collection('auth_tokens')
    .where({ token })
    .limit(1)
    .get();
  const tokenDoc = tokenRes.data && tokenRes.data[0];
  if (!tokenDoc) return null;
  // Token 过期检查（expiresAt 为毫秒时间戳）
  if (tokenDoc.expiresAt && tokenDoc.expiresAt < Date.now()) return null;

  const userId = tokenDoc.userId;
  if (!userId) return null;

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data && userRes.data[0];
  if (!user) return null;
  return user;
}

/**
 * 强制登录校验中间件。
 * 支持两种调用签名以兼容不同调用场景：
 *   requireLogin(context)          —— 仅传 context（无 event）
 *   requireLogin(event, context)   —— 传完整的 event 和 context
 *
 * @returns {Promise<Object>} 已登录的用户对象
 * @throws {ApiError} 401 - 未登录或 token 失效
 */
async function requireLogin(arg1, arg2) {
  const event = arg2 ? arg1 : null;
  const context = arg2 ? arg2 : arg1;

  // 路径 A：context 中已有平台注入的用户信息，直接使用（无需 DB 查询，更快）
  const contextUser = getAuthUser(context);
  if (contextUser && normalizeUserId(contextUser)) {
    return contextUser;
  }

  // 路径 B：从请求体或请求头提取 token，到 auth_tokens 集合验证
  const token = getTokenFromEvent(event || context);
  if (!token) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Unauthorized');
  }

  const user = await getUserByToken(token);
  if (!user) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Unauthorized');
  }

  return user;
}

/**
 * 角色鉴权中间件，在登录校验的基础上进一步验证角色。
 * @param {string[]} roles - 允许访问的角色列表，如 ['admin'] 或 ['admin', 'barber']
 * @returns {Promise<Object>} 已登录且角色匹配的用户对象
 * @throws {ApiError} 403 - 已登录但角色不在 roles 列表中
 */
async function requireRole(roles, arg1, arg2) {
  const user = await requireLogin(arg1, arg2);
  const role = user.role || user.type || '';
  if (!Array.isArray(roles) || roles.length === 0) return user;
  if (!roles.includes(role)) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'Forbidden');
  }
  return user;
}

module.exports = {
  getAuthUser,
  getTokenFromEvent,
  requireLogin,
  requireRole
};
