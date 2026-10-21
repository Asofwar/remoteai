import { NativeModules } from 'react-native';
import type { AndroidDownloadProgress } from './androidDownloadProgress';

type AndroidDownloadStatus = 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'missing';

interface NativeDownloadSnapshot {
  status: AndroidDownloadStatus;
  receivedBytes: number;
  totalBytes: number;
}

interface AppUpdateModule {
  getDownloadStatus?(path: string): Promise<AndroidDownloadStatus>;
  getDownloadSnapshot?(path: string): Promise<NativeDownloadSnapshot>;
}

interface AndroidDownloadSnapshot {
  status: AndroidDownloadStatus | 'unavailable';
  progress?: AndroidDownloadProgress;
}

const SPEED_SAMPLE_INTERVAL_MS = 1_000;
let previousSample: { path: string; receivedBytes: number; at: number; bytesPerSecond: number } | undefined;

export async function getAndroidDownloadSnapshot(
  path: string, expectedSize: number,
): Promise<AndroidDownloadSnapshot> {
  const module = NativeModules.AppUpdate as AppUpdateModule | undefined;
  // Keep compatibility with installed builds that only expose the system status.
  if (!module?.getDownloadSnapshot) {
    previousSample = undefined;
    return { status: await module?.getDownloadStatus?.(path) ?? 'unavailable' };
  }
  const snapshot = await module.getDownloadSnapshot(path);
  if (!['pending', 'running', 'paused'].includes(snapshot.status)) {
    previousSample = undefined;
    return { status: snapshot.status };
  }
  return { status: snapshot.status, progress: restoredProgress({ path, expectedSize, snapshot }) };
}

function restoredProgress({ path, expectedSize, snapshot }: {
  path: string; expectedSize: number; snapshot: NativeDownloadSnapshot;
}): AndroidDownloadProgress {
  const at = Date.now();
  const receivedBytes = Math.max(0, snapshot.receivedBytes);
  const previous = previousSample?.path === path ? previousSample : undefined;
  const elapsed = previous ? at - previous.at : 0;
  const advanced = previous ? Math.max(0, receivedBytes - previous.receivedBytes) : 0;
  let bytesPerSecond = previous?.bytesPerSecond ?? 0;
  if (!previous || elapsed < 0 || receivedBytes < previous.receivedBytes || snapshot.status !== 'running') {
    bytesPerSecond = 0;
    previousSample = { path, receivedBytes, at, bytesPerSecond };
  } else if (elapsed >= SPEED_SAMPLE_INTERVAL_MS) {
    // Multiple subscribed views can refresh close together; retain a meaningful speed sample.
    bytesPerSecond = Math.floor(advanced * 1000 / elapsed);
    previousSample = { path, receivedBytes, at, bytesPerSecond };
  }
  return {
    receivedBytes, totalBytes: snapshot.totalBytes > 0 ? snapshot.totalBytes : Math.max(0, expectedSize),
    bytesPerSecond, phase: 'downloading',
  };
}
