import { ArrowLeft, FileSearch, RefreshCw, Save, Settings2 } from 'lucide-react';
import { ProjectTabs } from './ProjectTabs';
import { ProjectFilePanel } from './ProjectFilePanel';
import { isDirty, type ProjectDocuments } from './documents';
import type { EditorGroup } from './editorGroups';
import type { BrowserTranslate } from './ProjectTree';
import type { useTabActions } from './useTabActions';
import { frameStyle, type EditorFrame } from './editorLayout';

export interface EditorPaneOptions {
  store: ProjectDocuments; cwd: string; connected: boolean; t: BrowserTranslate;
  actions: ReturnType<typeof useTabActions>; back: () => void; settings: () => void; settingsOpen: boolean;
}

export function ProjectEditorPane({ group, frame, options }: {
  group: EditorGroup; frame: EditorFrame; options: EditorPaneOptions;
}) {
  const { store, cwd, connected, t, actions } = options;
  const tabs = group.paths.flatMap(path => { const tab = store.get(path); return tab ? [tab] : []; });
  const active = store.get(group.activePath);
  const blocked = !!store.getSnapshot().mutationPath || !!actions.pending || actions.busy;
  const save = () => { if (connected && active && !blocked) void store.save(active.path); };
  const relativePath = group.activePath?.replace(/\\/g, '/')
    .replace(`${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/`, '');
  return <section className="pf-editor-pane" data-group={group.id}
    data-active={group.id === store.getSnapshot().activeGroupId} style={frameStyle(frame)}
    aria-label={t('编辑区域')} onPointerDownCapture={() => store.focusGroup(group.id)}
    onFocusCapture={() => store.focusGroup(group.id)}>
    <header className="pf-file-heading">
      <button type="button" className="pf-back" aria-label={t('返回文件列表')} onClick={options.back}>
        <ArrowLeft size={18} /></button>
      <div className="pf-file-name">
        {tabs.length ? <ProjectTabs tabs={tabs} activePath={group.activePath} groupId={group.id} blocked={blocked}
          connected={connected} choose={path => store.select(path, group.id)}
          close={path => actions.close({ groupId: group.id, path })} command={actions.command} t={t} />
          : <strong>{t('文件内容')}</strong>}
        <span className="pf-file-path">{relativePath}</span>
      </div>
      <button type="button" aria-label={t('文件浏览设置')} aria-expanded={options.settingsOpen}
        onClick={options.settings}><Settings2 size={16} /></button>
      {active && <button type="button" aria-label={t('重新加载文件')}
        disabled={active.loading || active.saving || !connected || blocked}
        onClick={() => actions.guard([active.path], () => { void store.reload(active.path); })}>
        <RefreshCw size={16} /></button>}
      {active?.document?.kind === 'text' && <button type="button" className="pf-save"
        disabled={!connected || !isDirty(active) || active.document.readOnly
          || active.loading || active.saving || blocked}
        onClick={save}><Save size={16} />{t(active.saving ? '正在保存…' : '保存')}</button>}
    </header>
    {!active && <div className="pf-empty"><FileSearch size={36} /><p>{t('选择文件以查看内容')}</p></div>}
    {tabs.map(tab => <ProjectFilePanel key={tab.path} tab={tab} active={tab.path === group.activePath}
      connected={connected} edit={text => store.edit(tab.path, text)}
      save={() => { if (connected && !blocked) void store.save(tab.path); }} t={t} />)}
  </section>;
}
