import { NativeModules } from 'react-native';

type AndroidDownloadStatus = 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'missing';

interface AppUpdateModule {
  getDownloadStatus(path: string): Promise<AndroidDownloadStatus>;
}

export async function getAndroidDownloadStatus(path: string): Promise<AndroidDownloadStatus | 'unavailable'> {
  const module = NativeModules.AppUpdate as AppUpdateModule | undefined;
  // Older native builds cannot confirm that an interrupted download is still active.
  return module ? module.getDownloadStatus(path) : 'unavailable';
}
