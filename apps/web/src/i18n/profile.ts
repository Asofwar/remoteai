import { t } from './index';

export function profileRole(profile?: { role: string; roleName?: string | null } | null) {
  const name = profile?.roleName;
  if (name && name !== '管理员' && name !== '用户') return name;
  return t(name || (profile?.role === 'admin' ? '管理员' : '用户'));
}
