import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, FileSearch, RefreshCw, Save, Settings2 } from 'lucide-react';
import type { ProjectBrowserClient } from './protocol';
import { ProjectTree, type BrowserTranslate } from './ProjectTree';
import { ProjectFilePanel } from './ProjectFilePanel';
import { ProjectTabs } from './ProjectTabs';
import { isDirty, type DocumentsSnapshot } from './documents';
import { AutoSaveSettings } from './AutoSaveSettings';
import { useBrowserPreferences } from './useBrowserPreferences';
import { useAutoSave } from './useAutoSave';
import type { BrowserPreferences } from './preferences';
import { useProjectDocument } from './useProjectDocument';
import { useTreeResize } from './useTreeResize';
import { PendingChanges } from './PendingChanges';
import './projectBrowser.css';
import type { BrowserHost } from './entryActions';
import './treeActions.css';

export interface ProjectBrowserHandle {
  requestClose: () => void; saveActive: () => void; snapshot: () => DocumentsSnapshot;
}
interface Props {
  client: ProjectBrowserClient; cwd: string; connected: boolean; t: BrowserTranslate; onClose: () => void;
  preferences?: BrowserPreferences;
  host: BrowserHost;
  initialSnapshot?: DocumentsSnapshot;
}

export const ProjectBrowser = forwardRef<ProjectBrowserHandle, Props>(function ProjectBrowser(
  { client, cwd, connected, t, onClose, preferences: suppliedPreferences, initialSnapshot, host: actionsHost }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const file = useProjectDocument(client, cwd, initialSnapshot);
  const split = useTreeResize(host);
  const [showFile, setShowFile] = useState(!!file.activePath);
  const [pending, setPending] = useState<{ path: string; action: () => void } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const localPreferences = useBrowserPreferences();
  const preferences = suppliedPreferences ?? localPreferences;
  const document = file.document;
  const guard = (path: string, action: () => void) => {
    const tab = file.store.get(path);
    if (tab?.saving || file.mutationPath) return;
    if (tab && isDirty(tab)) setPending({ path, action }); else action();
  };
  useAutoSave({ tabs: file.tabs, store: file.store, delay: preferences.delay,
    enabled: connected && !pending && !file.mutationPath });
  const dirty = file.tabs.some(isDirty);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const choose = (path: string) => {
    setShowFile(true); void file.open(path);
  };
  const save = () => { if (connected && !pending) void file.save(); };
  useImperativeHandle(ref, () => ({ requestClose: onClose, saveActive: save, snapshot: file.store.getSnapshot }));
  const relativePath = file.activePath?.replace(/\\/g, '/')
    .replace(`${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/`, '');
  const pendingTab = file.store.get(pending?.path);
  return <div ref={host} className="pf-browser" data-show-file={showFile} data-narrow={split.narrow}
    style={{ '--pf-tree-width': `${split.width}px` } as CSSProperties} onKeyDownCapture={event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault(); event.stopPropagation(); save();
    }}>
    {!connected && <p className="pf-connection" role="status">{t('连接已断开，重新连接后即可继续。')}</p>}
    <div className="pf-browser-layout">
      <ProjectTree client={client} cwd={cwd} connected={connected} selected={file.activePath} choose={choose} t={t}
        host={actionsHost} documents={file.store} />
      <div className="pf-splitter" role="separator" tabIndex={0} aria-orientation="vertical"
        aria-label={t('调整文件树宽度')} aria-valuemin={split.minimum} aria-valuemax={split.maximum}
        aria-valuenow={split.width} {...split.handle} />
      <section className="pf-file" aria-label={t('文件预览')}>
        <header className="pf-file-heading">
          <button type="button" className="pf-back" aria-label={t('返回文件列表')} onClick={() => setShowFile(false)}>
            <ArrowLeft size={18} /></button>
          <div className="pf-file-name">
            {file.tabs.length > 0 ? <ProjectTabs tabs={file.tabs} activePath={file.activePath} choose={choose}
              close={path => guard(path, () => file.store.close(path))} t={t} /> : <strong>{t('文件内容')}</strong>}
            <span className="pf-file-path">{relativePath}</span></div>
          <button type="button" aria-label={t('文件浏览设置')} aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={16} /></button>
          {file.activePath && <button type="button" aria-label={t('重新加载文件')}
            disabled={file.loading || file.saving || !connected || !!file.mutationPath}
            onClick={() => guard(file.activePath!, () => void file.store.reload(file.activePath!))}>
            <RefreshCw size={16} /></button>}
          {document?.kind === 'text' && <button type="button" className="pf-save"
            disabled={!connected || !file.dirty || document.readOnly || file.loading || file.saving
              || !!file.mutationPath} onClick={save}>
            <Save size={16} />{t(file.saving ? '正在保存…' : '保存')}</button>}
        </header>
        {settingsOpen && <div className="pf-settings"><AutoSaveSettings preferences={preferences} t={t} /></div>}
        {!file.active && <div className="pf-empty"><FileSearch size={36} />
          <p>{t('选择文件以查看内容')}</p></div>}
        {file.tabs.map(tab => <ProjectFilePanel key={tab.path} tab={tab} active={tab.path === file.activePath}
          connected={connected} edit={text => file.store.edit(tab.path, text)}
          save={() => { if (connected && !pending) void file.store.save(tab.path); }} t={t} />)}
      </section>
    </div>
    {pending && <PendingChanges saving={pendingTab?.saving ?? false} connected={connected}
      error={pendingTab?.error ?? ''} path={pending.path} t={t}
      cancel={() => setPending(null)} discard={() => { setPending(null); pending.action(); }}
      save={async () => {
        if (connected && await file.store.saveAll([pending.path])) { setPending(null); pending.action(); }
      }} />}
  </div>;
});
