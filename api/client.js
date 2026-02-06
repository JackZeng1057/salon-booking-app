import { authStore } from '../store/auth';

// 云函数调用封装：自动携带令牌并统一错误处理
export async function callCloud(name, data = {}) {
  const payload = { ...data };
  if (authStore.state.token) {
    payload.token = authStore.state.token;
  }

  const res = await uniCloud.callFunction({
    name,
    data: payload
  });

  const result = res && res.result;
  if (!result) {
    throw new Error('No response');
  }
  if (result.code !== 0) {
    const err = new Error(result.message || 'Request failed');
    err.code = result.code;
    err.data = result.data;
    throw err;
  }

  return result.data;
}
