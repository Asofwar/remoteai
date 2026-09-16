import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Toast } from '../components/AppToast';
import { checkForAppUpdate, installDownloadedAndroidUpdate,
  startAndroidUpdateDownload, type AppRelease, type AppUpdateCheck } from '../update/appUpdate';
import { useAndroidUpdateDownloadState } from '../update/useAndroidUpdateDownloadState';

export function openReleasePage(url: string) {
  void Linking.openURL(url).catch(() => Toast.fail('无法打开页面，请稍后重试'));
}

export function useAppUpdate() {
  const [checking, setChecking] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<AppUpdateCheck | null>(null);
  const [error, setError] = useState('');
  const checkingRef = useRef(false);
  const downloadState = useAndroidUpdateDownloadState();
  const beginDownload = useCallback((release: AppRelease) => {
    if (Platform.OS !== 'android' || !release.androidAsset) {
      openReleasePage(release.releaseUrl);
      return;
    }
    Toast.success('已开始下载，可在通知栏查看进度');
    void startAndroidUpdateDownload(release).catch(() => Toast.fail('下载失败，请稍后重试'));
  }, []);
  const checkForUpdate = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError('');
    try {
      const result = await checkForAppUpdate();
      setUpdateCheck(result);
    } catch {
      setError('暂时无法检查更新，请重试。');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);
  useEffect(() => { void checkForUpdate(); }, [checkForUpdate]);
  const installDownloaded = () => {
    if (downloadState.status !== 'downloaded') return;
    void installDownloadedAndroidUpdate(downloadState.path).catch(() => Toast.fail('无法开始安装，请稍后重试'));
  };
  return { checking, updateCheck, downloadState, error, checkForUpdate, beginDownload, installDownloaded };
}
