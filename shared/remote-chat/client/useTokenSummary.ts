import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadTokenSummary, TokenSummary } from '../tokenSummary';
import { createDashboardLoader } from '../../../apps/desktop/src/components/TokenUsageDashboard/dashboardLoader';

export function useTokenSummary({ read, active }: { read: ReadTokenSummary; active: boolean }) {
  const [weeks, setWeeks] = useState<number>();
  const [data, setData] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scheduler = useRef(createDashboardLoader());
  const reload = useRef(() => undefined as void);

  useEffect(() => {
    if (!active) { reload.current = () => undefined; setLoading(false); return; }
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshSeconds = 60;
    const task = async () => {
      if (!mounted) return;
      clearTimeout(timer);
      setLoading(true);
      setError('');
      try {
        const next = await read(weeks);
        refreshSeconds = next.refreshSeconds;
        if (mounted) setData(next);
      } catch {
        if (mounted) setError('暂时无法加载，请确认电脑已连接且已更新至最新版本，再重试。');
      } finally {
        if (mounted) {
          setLoading(false);
          timer = setTimeout(() => { void scheduler.current(task); }, refreshSeconds * 1000);
        }
      }
    };
    reload.current = () => { void scheduler.current(task); };
    void scheduler.current(task, true);
    return () => { mounted = false; clearTimeout(timer); };
  }, [active, read, weeks]);

  const changeWeeks = useCallback((value: number) => { setData(null); setWeeks(value); }, []);
  const refresh = useCallback(() => reload.current(), []);
  return { data, weeks: weeks ?? data?.weeks, loading, error, changeWeeks, refresh };
}
