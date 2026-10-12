import { DeviceEventEmitter } from 'react-native';

export interface AndroidDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  phase: 'downloading' | 'verifying';
}

export function updateDownloadPercent(progress: AndroidDownloadProgress | undefined) {
  if (!progress || progress.totalBytes <= 0) return null;
  return Math.min(100, Math.floor(progress.receivedBytes / progress.totalBytes * 100));
}

export function subscribeAndroidDownloadProgress(path: string, listener: (value: AndroidDownloadProgress) => void) {
  const subscription = DeviceEventEmitter.addListener('appUpdateDownloadProgress', (event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const value = event as Record<string, unknown>;
    if (value.path !== path || (value.phase !== 'downloading' && value.phase !== 'verifying')) return;
    const counters = [value.receivedBytes, value.totalBytes, value.bytesPerSecond];
    if (!counters.every(counter => typeof counter === 'number' && Number.isFinite(counter) && counter >= 0)) return;
    listener({ receivedBytes: value.receivedBytes as number, totalBytes: value.totalBytes as number,
      bytesPerSecond: value.bytesPerSecond as number, phase: value.phase });
  });
  return () => subscription.remove();
}
