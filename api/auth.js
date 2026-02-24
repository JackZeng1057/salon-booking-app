/**
 * @file api/auth.js — 认证与用户资料前端 API 封装
 *
 * 【职责定位】
 * 封装认证流程中所有 callCloud 调用，供前端页面使用：
 *   - register()      → auth-register 云函数（三角色注册）
 *   - login()         → auth-login 云函数（账号密码登录，返回 token）
 *   - me()            → auth-me 云函数（获取当前用户身份，用于角色路由）
 *   - bindPhone()     → user-bind-phone 云函数（绑定手机号，用于密码找回前置）
 *   - updateProfile() → user-profile-update 云函数（修改昵称/头像）
 *
 * 【与 store/auth.js 的配合】
 * login() 返回的 token 由页面层写入 store/auth.js 的 Vuex store，
 * 后续所有 callCloud 调用都由 api/client.js 自动从 store 读取并注入。
 *
 * 【会话保持设计】
 * me() 在每次 App.vue onLaunch 时调用，
 * 从云端刷新用户状态（role/approvalStatus），避免本地缓存状态过期，
 * 尤其对于 barber 角色的审核状态变化（pending→approved/rejected）特别重要。
 */
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
