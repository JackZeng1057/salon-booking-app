// 登录与角色校验工具：支持令牌与平台注入用户
const { ApiError, ERROR_CODES } = require('./errors');

// 从 context 中尽量获取平台注入的已登录用户信息
function getAuthUser(context) {
  if (!context) return null;
  return context.auth || context.user || context.userInfo || context.USERINFO || null;
}

// 从请求中读取令牌，支持 event.token 或 Authorization: Bearer 请求头
function getTokenFromEvent(event) {
  if (!event) return '';
  const direct = event.token || event.accessToken || '';
  if (direct) return direct;

  const headers = event.headers || event.header || {};
  const authHeader = headers.authorization || headers.Authorization || '';
  const m = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  return m ? m[1] : '';
}

// 统一兼容用户 ID 字段（uid / _id / userId）
function normalizeUserId(user) {
  return (user && (user.uid || user._id || user.userId)) || '';
}

// 通过令牌反查用户信息（先查 auth_tokens，再查 users）
async function getUserByToken(token) {
  const db = uniCloud.database();

  const tokenRes = await db
    .collection('auth_tokens')
    .where({ token })
    .limit(1)
    .get();
  const tokenDoc = tokenRes.data && tokenRes.data[0];
  if (!tokenDoc) return null;
  if (tokenDoc.expiresAt && tokenDoc.expiresAt < Date.now()) return null;

  const userId = tokenDoc.userId;
  if (!userId) return null;

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data && userRes.data[0];
  if (!user) return null;
  return user;
}

// 强制登录校验，支持 requireLogin(context) 或 requireLogin(event, context)
async function requireLogin(arg1, arg2) {
  const event = arg2 ? arg1 : null;
  const context = arg2 ? arg2 : arg1;

  const contextUser = getAuthUser(context);
  if (contextUser && normalizeUserId(contextUser)) {
    return contextUser;
  }

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

// 角色校验，不满足则抛出 403
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
