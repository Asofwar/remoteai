export function resetLabel(timestamp?: number | null) {
  if (!timestamp) return '重置时间暂不可用';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '重置时间暂不可用';
  const milliseconds = date.getTime() - Date.now();
  if (milliseconds <= 0) return '即将重置';
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `约 ${days ? `${days} 天 ` : ''}${hours} 小时 ${minutes} 分后重置`;
}

export function maskEmail(email: string) {
  const at = email.indexOf('@');
  if (at < 2) return '******';
  const local = email.slice(0, at);
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(5, Math.max(2, local.length - 2)))}${email.slice(at)}`;
}
