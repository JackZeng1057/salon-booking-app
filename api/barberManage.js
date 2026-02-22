// 管理员理发师管理接口
import { callCloud } from './client';

export function fetchManagedBarbers() {
  return callCloud('barbers-manage', { action: 'list' }).then((data) => (data && data.list) || []);
}

export function renameManagedBarber(barberId, username) {
  return callCloud('barbers-manage', {
    action: 'rename',
    barberId,
    username
  });
}

export function removeManagedBarber(barberId) {
  return callCloud('barbers-manage', {
    action: 'remove',
    barberId
  });
}

