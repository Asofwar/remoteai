export { maskEmail, resetLabel, displayDate, displayFullDate } from '../../../native/src/accounts/formatters';
export { earliestExpirationDate } from '../../../native/src/utils/expiration';

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
