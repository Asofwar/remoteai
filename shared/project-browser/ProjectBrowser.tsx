import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import type { ProjectBrowserClient } from './protocol';
import { ProjectTree, type BrowserTranslate } from './ProjectTree';
import { ProjectEditorWorkspace } from './ProjectEditorWorkspace';
import { isDirty, type DocumentsSnapshot } from './documents';
import { AutoSaveSettings } from './AutoSaveSettings';
import { useBrowserPreferences } from './useBrowserPreferences';
import { useAutoSave } from './useAutoSave';
import type { BrowserPreferences } from './preferences';
import { useProjectDocument } from './useProjectDocument';
import { useTreeResize } from './useTreeResize';
import { PendingChanges } from './PendingChanges';
import { useTabActions } from './useTabActions';
import { TreeActionDialog } from './TreeActionDialog';
import './projectBrowser.css';
import type { BrowserHost } from './entryActions';
import './treeActions.css';
import './editorWorkspace.css';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const actions = useTabActions({ store: file.store, cwd, connected, host: actionsHost });
  const localPreferences = useBrowserPreferences();
  const preferences = suppliedPreferences ?? localPreferences;
  useAutoSave({ tabs: file.tabs, store: file.store, delay: preferences.delay,
    enabled: connected && !actions.pending && !actions.rename && !file.mutationPath });
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
  const save = () => { if (connected && !actions.pending && !actions.rename) void file.save(); };
  useImperativeHandle(ref, () => ({ requestClose: onClose, saveActive: save, snapshot: file.store.getSnapshot }));
  const pendingPath = actions.pending?.paths[0];
  const pendingTab = file.store.get(pendingPath);
  return <div ref={host} className="pf-browser" data-show-file={showFile} data-narrow={split.narrow}
    style={{ '--pf-tree-width': `${split.width}px` } as CSSProperties} onKeyDownCapture={event => {
      if (event.altKey || !(event.ctrlKey || event.metaKey) || actions.rename || actions.pending) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); save(); }
      if (event.ctrlKey && event.key === 'F4' && file.activePath) {
        event.preventDefault(); event.stopPropagation();
        actions.close({ groupId: file.activeGroupId, path: file.activePath });
      }
    }}>
    {!connected && <p className="pf-connection" role="status">{t('连接已断开，重新连接后即可继续。')}</p>}
    <div className="pf-browser-layout">
      <ProjectTree client={client} cwd={cwd} connected={connected} selected={file.activePath} choose={choose} t={t}
        host={actionsHost} documents={file.store} />
      <div className="pf-splitter" role="separator" tabIndex={0} aria-orientation="vertical"
        aria-label={t('调整文件树宽度')} aria-valuemin={split.minimum} aria-valuemax={split.maximum}
        aria-valuenow={split.width} {...split.handle} />
      <section className="pf-file" aria-label={t('文件预览')}>
        {settingsOpen && <div className="pf-settings"><AutoSaveSettings preferences={preferences} t={t} /></div>}
        <ProjectEditorWorkspace narrow={split.narrow} options={{ store: file.store, cwd, connected, t, actions,
          quoteSelection: actionsHost.quoteSelection,
          back: () => setShowFile(false), settings: () => setSettingsOpen(!settingsOpen), settingsOpen }} />
      </section>
    </div>
    {actions.feedback && <p className="pf-feedback" role="status">{t(actions.feedback)}</p>}
    {actions.error && !actions.rename && <p className="pf-feedback" role="alert">{t(actions.error)}</p>}
    {pendingPath && <PendingChanges saving={pendingTab?.saving ?? false} connected={connected}
      error={pendingTab?.error ?? ''} path={pendingPath} t={t} cancel={actions.cancelPending}
      discard={actions.discard} save={() => { void actions.savePending(); }} />}
    {actions.rename && <TreeActionDialog prompt={actions.rename} busy={actions.busy} connected={connected}
      error={actions.error} confirm={name => { void actions.confirmRename(name); }} cancel={actions.cancelRename} t={t} />}
  </div>;
});
