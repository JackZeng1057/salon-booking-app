// 理发师审核相关接口
import { callCloud } from './client';

// 获取理发师申请列表（管理员）
export function fetchBarberApplications(payload = {}) {
  return callCloud('barber-applications-list', payload);
}

// 审核理发师申请（管理员）
export function reviewBarberApplication(payload = {}) {
  return callCloud('barber-application-review', payload);
}
