import { ChevronDown, ChevronRight, File, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import type { ProjectBrowserClient } from './protocol';
import { useProjectTree, type DirectoryState } from './useProjectTree';

export type BrowserTranslate = (source: string) => string;

function DirectoryNotice({ state, retry, t }: {
  state?: DirectoryState; retry: () => void; t: BrowserTranslate;
}) {
  if (state?.loading) return <p className="pf-notice" role="status">{t('正在加载…')}</p>;
  if (state?.error) return <div className="pf-notice" role="alert">{t(state.error)}
    <button type="button" onClick={retry}>{t('重试')}</button></div>;
  if (state?.data?.truncated) return <p className="pf-notice">{t('文件较多，仅显示前 500 项。')}</p>;
  if (state?.data && !state.data.entries.length) return <p className="pf-notice">{t('文件夹为空')}</p>;
  return null;
}

export function ProjectTree({ client, cwd, connected, selected, choose, t }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; selected?: string;
  choose: (path: string) => void; t: BrowserTranslate;
}) {
  const tree = useProjectTree(client, cwd, connected);
  return <nav className="pf-tree" aria-label={t('项目文件')}>
    <div className="pf-tree-heading"><span>{cwd.split(/[\\/]/).filter(Boolean).at(-1)}</span>
      <button type="button" aria-label={t('刷新文件树')} disabled={!connected}
        onClick={tree.refresh}><RefreshCw size={16} /></button></div>
    <div role="tree" aria-label={t('项目文件')} className="pf-tree-list">
      {tree.rows.map(({ entry, depth }) => {
        const expanded = tree.expanded.has(entry.path);
        const Icon = entry.directory ? (expanded ? FolderOpen : Folder) : File;
        return <div key={entry.path} role="none">
          <button type="button" role="treeitem" aria-level={depth + 1}
            aria-expanded={entry.directory ? expanded : undefined}
            aria-selected={selected === entry.path} disabled={!connected}
            className="pf-tree-row" style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => entry.directory ? tree.toggle(entry) : choose(entry.path)}
            onKeyDown={event => {
              if (!entry.directory) return;
              if ((event.key === 'ArrowRight' && !expanded) || (event.key === 'ArrowLeft' && expanded)) {
                event.preventDefault(); tree.toggle(entry);
              }
            }}>
            {entry.directory ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
              : <span className="pf-tree-spacer" />}
            <Icon size={16} /><span>{entry.name}</span>
          </button>
          {entry.directory && expanded && <DirectoryNotice state={tree.directories[entry.path]}
            retry={() => void tree.load(entry.path)} t={t} />}
        </div>;
      })}
      <DirectoryNotice state={tree.directories['']} retry={() => void tree.load('')} t={t} />
    </div>
  </nav>;
}
