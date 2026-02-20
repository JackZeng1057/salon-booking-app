import { callCloud } from './client';

// AI 服务顾问：根据用户描述和可选图片推荐 1-3 个真实服务
// 入参：{ text, imageFileIds, storeId? }；当不传 storeId 时走全门店推荐
export function adviseServices(payload) {
  return callCloud('ai-service-advisor', payload || {}, { timeout: 30000 });
}
