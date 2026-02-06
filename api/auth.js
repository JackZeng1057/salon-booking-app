// 认证相关接口：注册、登录、获取当前用户
import { callCloud } from './client';

// 注册接口
export function register(payload) {
  return callCloud('auth-register', payload);
}

// 登录接口
export function login(payload) {
  return callCloud('auth-login', payload);
}

// 获取当前用户信息
export function me() {
  return callCloud('auth-me');
}
