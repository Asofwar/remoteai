import { lazy, Suspense, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderSearch, Maximize2, Minimize2, X } from 'lucide-react';
import { WorkspaceDrawerContext } from '../../../../../shared/chat/workspaceDrawer';
import type { ProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import type { ProjectBrowserHandle } from '../../../../../shared/project-browser/ProjectBrowser';
import { useDrawerResize } from '../../../../desktop/src/pages/codexGui/useDrawerResize';
import styles from '../../../../desktop/src/pages/codexGui/DetailsWorkspace.module.less';
import { useDesktopLayout } from '../../useDesktopLayout';
import { useGitTheme } from '../git/gitTheme';
import { t, useLanguage } from '../../i18n';
import './projectBrowserDrawer.css';
import type { BrowserHost } from '../../../../../shared/project-browser/entryActions';
import { browserHost } from './browserHost';

const Browser = lazy(() => import('../../../../../shared/project-browser/ProjectBrowser')
  .then(module => ({ default: module.ProjectBrowser })));
const MIN_CHAT_WIDTH = 520;

export function ProjectBrowserDrawer({ client, cwd, connected, active, onClose,
  desktopStyle = false, host: suppliedHost }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; active: boolean;
  onClose: () => void; desktopStyle?: boolean; host?: BrowserHost;
}) {
  useLanguage();
  const workspace = useContext(WorkspaceDrawerContext);
  const desktop = useDesktopLayout();
  const theme = useGitTheme(desktopStyle);
  const actionsHost = useMemo(() => suppliedHost ?? browserHost(client), [suppliedHost, client]);
  const host = useMemo(() => ({ current: workspace?.host ?? null }), [workspace?.host]);
  const resize = useDrawerResize(host, { storageKey: 'codex-switch:project-files-width',
    defaultWidth: 960, defaultRatio: .85 });
  const [expanded, setExpanded] = useState(false);
  const browser = useRef<ProjectBrowserHandle>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef(document.activeElement);
  const id = useId();
  const visible = active && workspace?.active !== false;
  const width = expanded || !desktop ? resize.available : resize.width;
  const reserve = workspace?.reserve;
  const close = () => { if (browser.current) browser.current.requestClose(); else onClose(); };
  useEffect(() => {
    if (!desktop || !visible) return;
    reserve?.(!expanded && resize.available - width >= MIN_CHAT_WIDTH ? width : 0);
    return () => reserve?.(0);
  }, [reserve, desktop, visible, expanded, resize.available, width]);
  useEffect(() => {
    if (!visible) return;
    opener.current = document.activeElement;
    closeButton.current?.focus();
    return () => { if (opener.current instanceof HTMLElement) opener.current.focus(); };
  }, [visible, host]);
  useEffect(() => { if (!visible || expanded || !desktop) resize.cancel(); },
    [visible, expanded, desktop, resize.cancel]);
  if (!workspace?.host) return null;
  return createPortal(<aside id={id} hidden={!visible} role="dialog" aria-label={t('文件浏览')}
    className={`${styles.drawer} project-browser-drawer`} data-dragging={resize.dragging || undefined}
    style={{ ...theme, width }} onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopPropagation(); browser.current?.saveActive(); return;
      }
      if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close(); }
    }}>
    {desktop && !expanded && <div className={styles.resizeHandle} role="separator" tabIndex={0}
      aria-label={t('调整文件浏览器宽度')} aria-orientation="vertical" aria-controls={id}
      aria-valuemin={resize.minimum} aria-valuemax={resize.maximum} aria-valuenow={width} {...resize.handle} />}
    <header className={styles.header}>
      <span className="project-browser-title"><FolderSearch size={17} />{t('文件浏览')}</span>
      <span className="project-browser-project">{cwd.split(/[\\/]/).filter(Boolean).at(-1)}</span>
      <div className={styles.controls}>
        {desktop && <button type="button" aria-label={t(expanded ? '还原文件浏览器宽度' : '展开文件浏览器')}
          onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
        <button type="button" ref={closeButton} aria-label={t('关闭文件浏览器')} onClick={close}><X size={18} /></button>
      </div>
    </header>
    <Suspense fallback={<p className="project-browser-loading" role="status">{t('正在加载…')}</p>}>
      <Browser ref={browser} client={client} cwd={cwd} connected={connected} t={t} onClose={onClose}
        host={actionsHost} />
    </Suspense>
  </aside>, workspace.host);
}
