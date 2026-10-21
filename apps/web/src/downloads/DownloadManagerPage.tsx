import { useState } from 'react';
import { ArrowLeft, Download, Folder, Monitor } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { downloadConnectionLabel } from '../../../../shared/remote-chat/downloadConnection';
import { DownloadBrowser } from './DownloadBrowser';
import { DownloadCard } from './DownloadCard';
import { useDownloadTasks } from './useDownloadTasks';
import './styles.css';

export function DownloadManagerPage({ owner, onBack }: { owner: string; onBack: () => void }) {
  useLanguage();
  const { connection, tasks, error, busy, run } = useDownloadTasks(owner);
  const [view, setView] = useState<'tasks' | 'project' | 'computer'>('tasks');
  if (view !== 'tasks' && connection) return <DownloadBrowser
    key={`${connection.deviceId}:${view}:${connection.threadId ?? connection.cwd ?? ''}`}
    connection={connection} scope={view} back={() => setView('tasks')} />;
  return <section className="downloads-page">
    <header className="downloads-header"><button type="button" className="download-icon-button"
      aria-label={t('返回设置')} onClick={onBack}><ArrowLeft size={22} /></button><h2>{t('下载管理')}</h2></header>
    <div className="download-source-heading">
      <span>{t('添加下载')}</span>
      <div className="download-connection" role="status">
        <span aria-hidden className={`download-connection-dot${connection?.ready ? '' : ' is-offline'}`} />
        <span className="download-connection-name">{connection?.deviceName || t('尚未连接电脑')}</span>
        {connection && <span>{t(downloadConnectionLabel(connection.mode))}</span>}
      </div>
    </div>
    <div className="download-sources">
      <button type="button" className="download-card" disabled={!connection?.ready || !(connection.threadId || connection.cwd)}
        onClick={() => setView('project')}><Folder size={24} /><strong>{t('当前项目')}</strong></button>
      <button type="button" className="download-card" disabled={!connection?.ready}
        onClick={() => setView('computer')}><Monitor size={24} /><strong>{t('此电脑')}</strong></button>
    </div>
    {error && <p role="alert" className="download-notice">{t(error)}</p>}
    <h3>{t('下载任务')} <small>{tasks.length}</small></h3>
    <div className="download-tasks">{tasks.map(task => <DownloadCard key={task.id} task={task} busy={busy === task.id}
      connected={!!connection?.ready && connection.deviceId === task.source.deviceId}
      action={() => { void run(task); }} open={() => { void run(task, 'open'); }}
      share={() => { void run(task, 'share'); }}
      remove={() => { void run(task, 'remove'); }} />)}</div>
    {!tasks.length && <div className="download-empty"><Download size={38} /><h3>{t('还没有下载任务')}</h3>
      <p>{t('从上方浏览文件，或在聊天的文件预览中点击下载。')}</p></div>}
  </section>;
}
