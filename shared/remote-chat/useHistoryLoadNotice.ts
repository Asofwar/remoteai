import { useEffect, useState } from 'react';
import type { HistoryLoadResult } from './client/historyLoad';

const NOTICE_DURATION_MS = 4000;

/** Share timing and expiry across both clients without affecting the message list's layout. */
export function useHistoryLoadNotice(result?: HistoryLoadResult) {
  const [visible, setVisible] = useState<HistoryLoadResult>();
  useEffect(() => {
    const remaining = result ? NOTICE_DURATION_MS - (Date.now() - result.completedAt) : 0;
    setVisible(remaining > 0 ? result : undefined);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setVisible(undefined), remaining);
    return () => clearTimeout(timer);
  }, [result]);
  if (!result || result !== visible) return undefined;
  return { count: result.count, seconds: (result.durationMs / 1000).toFixed(1) };
}
