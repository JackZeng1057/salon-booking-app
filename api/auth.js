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

// 绑定手机号（用于忘记密码）
export function bindPhone(payload) {
  return callCloud('user-bind-phone', payload);
}

// 更新资料（昵称/头像）
export function updateProfile(payload) {
  return callCloud('user-profile-update', payload);
}
