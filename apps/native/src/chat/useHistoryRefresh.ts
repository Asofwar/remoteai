import { useEffect, useRef, useState } from 'react';

const MIN_REFRESH_DURATION_MS = 450;

/** Keep native pull feedback visible even when a retry finishes immediately or the chat is offline. */
export function useHistoryRefresh(loadOlder: () => Promise<void>, loadingMore = false) {
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const onRefresh = async () => {
    if (active.current) return;
    active.current = true;
    setRefreshing(true);
    const started = Date.now();
    try { await loadOlder(); }
    finally {
      if (mounted.current) {
        timer.current = setTimeout(() => {
          active.current = false;
          setRefreshing(false);
        }, Math.max(0, MIN_REFRESH_DURATION_MS - (Date.now() - started)));
      }
    }
  };
  return { refreshing: refreshing || loadingMore, onRefresh };
}
