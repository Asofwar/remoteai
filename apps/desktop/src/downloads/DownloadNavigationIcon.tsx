import { useEffect, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { downloadManager } from '../../../web/src/downloads/manager';
import { LOCAL_DOWNLOAD_OWNER } from './localGitDownloads';
import { guiText } from '../i18n/guiText';
import styles from './DownloadNavigationIcon.module.less';

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'downloading', 'verifying']);

export function DownloadNavigationIcon({ owner }: { owner?: string }) {
  // Subscribe to the count so progress updates do not rerender the navigation.
  const count = useSyncExternalStore(downloadManager.subscribe, () => downloadManager.snapshot()
    .filter(task => (task.source.owner === owner || task.source.owner === LOCAL_DOWNLOAD_OWNER)
      && !task.source.preview && ACTIVE_STATUSES.has(task.status)).length);
  useEffect(() => { void downloadManager.initialize(); }, []);
  return <i className={styles.icon} data-download-target>
    <Download size={19} aria-hidden="true" />
    {count > 0 && <sup className={styles.count} role="status" aria-label={`${guiText('下载中')}：${count}`}>
      {count}
    </sup>}
  </i>;
}
