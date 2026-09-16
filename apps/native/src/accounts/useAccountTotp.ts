import { useEffect, useMemo, useState } from 'react';
import { generateTotp } from '../totp/totp';

const TOTP_PERIOD_SECONDS = 30;

export function useAccountTotp(secret: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!secret) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [secret]);
  return useMemo(() => {
    if (!secret) return null;
    try {
      const code = generateTotp({
        id: 'account-preview', issuer: 'ChatGPT', accountName: '', secret,
        algorithm: 'SHA1', digits: 6, period: TOTP_PERIOD_SECONDS,
        createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z',
      }, now);
      const elapsed = Math.floor(now / 1_000) % TOTP_PERIOD_SECONDS;
      return { code, remaining: TOTP_PERIOD_SECONDS - elapsed };
    } catch {
      return null;
    }
  }, [now, secret]);
}
