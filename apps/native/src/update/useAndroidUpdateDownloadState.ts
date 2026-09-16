import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getAndroidUpdateDownloadState, refreshAndroidUpdateDownloadState, subscribeAndroidUpdateDownload,
  type AndroidUpdateDownloadState } from './appUpdate';

export function useAndroidUpdateDownloadState() {
  const [state, setState] = useState<AndroidUpdateDownloadState>(getAndroidUpdateDownloadState);
  const refreshing = useRef(false);
  const refresh = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    void refreshAndroidUpdateDownloadState()
      .catch((error: unknown) => console.warn('Unable to refresh update download state', error))
      .finally(() => { refreshing.current = false; });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const unsubscribe = subscribeAndroidUpdateDownload(setState);
    refresh();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'android' || state.status !== 'downloading') return undefined;
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, [refresh, state.status]);

  return state;
}
