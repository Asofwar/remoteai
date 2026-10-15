import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog } from 'antd-mobile';
import { t } from '../i18n';
import { downloadManager } from './manager';
import type { DownloadTask } from './types';
import { DownloadOpenError, type DownloadOpener } from './openDownload';

export function useDownloadTasks(owner: string, options: {
  confirmRemove?: () => Promise<boolean>; openDownload?: DownloadOpener;
} = {}) {
  const allTasks = useSyncExternalStore(downloadManager.subscribe, downloadManager.snapshot);
  const current = useSyncExternalStore(downloadManager.subscribe, downloadManager.connection);
  const storageError = useSyncExternalStore(downloadManager.subscribe, downloadManager.error);
  const connection = current?.owner === owner ? current : undefined;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => { void downloadManager.initialize(); }, []);
  const run = async (task: DownloadTask, operation: 'action' | 'remove' | 'open' = 'action') => {
    if (pending.current) return;
    pending.current = true; setBusy(task.id); setError('');
    try {
      if (operation === 'open') await downloadManager.open(task.id, options.openDownload);
      else if (operation === 'remove') {
        const confirmed = await (options.confirmRemove?.() ?? Dialog.confirm({ title: t('删除下载？'),
          content: t('将删除此网页保存的文件和下载记录。已保存到设备的文件和电脑上的原文件会保留。'),
          confirmText: t('删除'), cancelText: t('保留'), bodyStyle: { maxWidth: 400 } }));
        if (confirmed) await downloadManager.remove(task.id);
      } else if (['completed', 'ready'].includes(task.status)) await downloadManager.save(task.id);
      else if (['queued', 'preparing', 'downloading', 'verifying'].includes(task.status)) await downloadManager.pause(task.id);
      else await downloadManager.resume(task.id);
    } catch (cause) {
      setError(cause instanceof DownloadOpenError ? cause.message : operation === 'open'
        ? '打开未完成，请重试或保存到设备后打开。' : '操作未完成，请检查浏览器存储空间后重试。');
    }
    finally { pending.current = false; setBusy(''); }
  };
  return { connection, busy, error: error || storageError, run,
    tasks: allTasks.filter(task => task.source.owner === owner && (!task.source.preview || task.exported))
      .slice().reverse() };
}
