import { useEffect, useRef } from "react";

const AGGREGATE_RUNTIME_REFRESH_MS = 2_000;

export function useAggregateRuntimeRefresh(options: { active: boolean; refresh: () => Promise<void> }) {
  const refreshRef = useRef(options.refresh);
  const inFlightRef = useRef(false);
  refreshRef.current = options.refresh;

  useEffect(() => {
    if (!options.active) return undefined;
    const refresh = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await refreshRef.current();
      } catch {
        // Runtime state is best-effort; a later interval can recover from a failed read.
      } finally {
        inFlightRef.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), AGGREGATE_RUNTIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [options.active]);
}
