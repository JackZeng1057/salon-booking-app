/**
 * @file store/auth.js — 全局认证状态管理
 *
 * 【职责定位】
 * 全应用唯一的认证状态容器，采用"简化版 Vuex"模式（不依赖 Vuex 库）：
 * 直接暴露响应式 state 对象，通过方法统一修改，避免意外直接赋值。
 *
 * 【状态字段说明】
 * - token  : 登录后获得的 48 位十六进制 Token，由 api/client.js 自动注入到每次 callCloud；
 * - user   : 当前用户完整对象（含 _id / username / role / storeId 等），
 *            供页面直接读取无需再查云端；
 * - role   : 当前角色字符串（'user'/'barber'/'admin'），
 *            影响底部导航栏展示和路由权限判断。
 *
 * 【持久化机制（uni.getStorageSync）】
 * token / user / role 均通过 uni.setStorageSync 持久化到本地存储，
 * App 冷启动时调用 init() 恢复，避免每次打开 App 都需要重新登录。
 * 本地 token 与云端 auth_tokens 集合的有效期（7天）保持一致。
 *
 * 【角色归一化（normalizeRole）】
 * 兼容"login 时 server 返回 role"和"注册时 user.role 已写入"两种情况，
 * 确保 state.role 始终为有效非空字符串。
 *
 * 【使用场景】
 * - App.vue onLaunch: authStore.init() 恢复登录态
 * - api/client.js callCloud: authStore.state.token 自动注入
 * - pages/auth/login.vue: authStore.setAuth({ token, user, role }) 写入登录结果
 * - pages/index/roleGate.vue: authStore.state.role 做角色路由决策
 * - 退出登录: authStore.clear() 清空所有登录态
 */
// 本地存储键，保证刷新后可恢复登录态
const STORAGE_KEY = 'authStore';

// 全局登录态
const state = {
  token: '',
  user: null,
  role: ''
};

// 从用户对象和显式传入 role 中统一得到角色
function normalizeRole(user, role) {
  if (role) return role;
  if (user && user.role) return user.role;
  return '';
}

// 持久化到本地存储
function persist() {
  uni.setStorageSync(STORAGE_KEY, {
    token: state.token,
    user: state.user,
    role: state.role
  });
}

const authStore = {
  state,
  // 应用启动时恢复登录态
  init() {
    const cached = uni.getStorageSync(STORAGE_KEY);
    if (cached && typeof cached === 'object') {
      state.token = cached.token || '';
      state.user = cached.user || null;
      state.role = cached.role || normalizeRole(cached.user, '');
    }
  },
  // 同时更新令牌/用户/角色
  setAuth({ token, user, role } = {}) {
    if (token !== undefined) state.token = token || '';
    if (user !== undefined) state.user = user || null;
    state.role = normalizeRole(user || state.user, role || state.role);
    persist();
  },
  // 单独更新令牌
  setToken(token) {
    state.token = token || '';
    persist();
  },
  // 单独更新 user
  setUser(user) {
    state.user = user || null;
    state.role = normalizeRole(user, state.role);
    persist();
  },
  // 清空登录态
  clear() {
    state.token = '';
    state.user = null;
    state.role = '';
    uni.removeStorageSync(STORAGE_KEY);
  }
};

export { authStore };
