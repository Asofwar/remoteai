import { getLocale, t } from '../i18n';
export { maskEmail } from '../../../native/src/accounts/formatters';
export { earliestExpirationDate } from '../../../native/src/utils/expiration';

export function resetLabel(timestamp?: number | null) {
  const remaining = timestamp ? timestamp * 1000 - Date.now() : NaN;
  if (!Number.isFinite(remaining)) return t('重置时间暂不可用');
  if (remaining <= 0) return t('即将重置');
  const totalMinutes = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes % 1440 / 60);
  const minutes = totalMinutes % 60;
  return t('约 {days}{hours} 小时 {minutes} 分后重置', {
    days: days ? t('{days} 天 ', { days }) : '', hours, minutes,
  });
}

export function displayDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return t('未刷新');
  return new Intl.DateTimeFormat(getLocale(), {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function displayFullDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return t('时间未知');
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function remainingPercent(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

const CRITICAL_PERCENT = 15;
const LOW_PERCENT = 40;

export function usageTone(remaining: number | null) {
  if (remaining === null) return 'unavailable';
  if (remaining <= CRITICAL_PERCENT) return 'danger';
  return remaining <= LOW_PERCENT ? 'warning' : 'healthy';
}
