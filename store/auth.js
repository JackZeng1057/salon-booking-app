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
