import { useEffect } from 'react';
import { AppState } from 'react-native';
import { reportMobileActivity } from './telemetry';

const ACTIVITY_CHECK_INTERVAL_MS = 60_000;

export function startMobileTelemetry(baseUrl: string) {
  let pending = false;
  const refresh = () => {
    if (pending || AppState.currentState !== 'active') return;
    pending = true;
    void reportMobileActivity(baseUrl)
      // Telemetry is best effort; foreground checks retry without interrupting the user.
      .catch(() => undefined)
      .finally(() => { pending = false; });
  };
  refresh();
  const timer = setInterval(refresh, ACTIVITY_CHECK_INTERVAL_MS);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}

export function useMobileTelemetry(baseUrl: string | null) {
  useEffect(() => {
    if (!baseUrl) return;
    return startMobileTelemetry(baseUrl);
  }, [baseUrl]);
}
