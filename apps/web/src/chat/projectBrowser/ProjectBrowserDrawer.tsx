import { lazy, Suspense, useCallback, useMemo, useRef } from 'react';
import { FolderSearch } from 'lucide-react';
import { WorkspaceDrawerTab } from '../../../../../shared/chat/WorkspaceDrawerTab';
import { workspaceTabId } from '../../../../../shared/chat/workspaceDrawer';
import type { ProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import type { ProjectBrowserHandle } from '../../../../../shared/project-browser/ProjectBrowser';
import { useGitTheme } from '../git/gitTheme';
import { browserHost } from './browserHost';
import type { BrowserHost } from '../../../../../shared/project-browser/entryActions';
import { t, useLanguage } from '../../i18n';
import './projectBrowserDrawer.css';

const Browser = lazy(() => import('../../../../../shared/project-browser/ProjectBrowser')
  .then(module => ({ default: module.ProjectBrowser })));
const FILES_ICON = <FolderSearch size={16} />;

export function ProjectBrowserDrawer({ client, cwd, connected, active, onClose,
  desktopStyle = false, host: suppliedHost }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; active: boolean;
  onClose: () => void; desktopStyle?: boolean; host?: BrowserHost;
}) {
  useLanguage();
  const theme = useGitTheme(desktopStyle);
  const browser = useRef<ProjectBrowserHandle>(null);
  const save = useCallback(() => browser.current?.saveActive(), []);
  const actionsHost = useMemo(() => suppliedHost ?? browserHost(client), [suppliedHost, client]);
  return <WorkspaceDrawerTab active={active}
    tab={{ id: workspaceTabId.files(cwd), title: t('文件浏览'), icon: FILES_ICON, save }}
    className="project-browser-drawer" style={theme}>
    {() => <Suspense fallback={<p className="project-browser-loading" role="status">{t('正在加载…')}</p>}>
      <Browser ref={browser} client={client} cwd={cwd} connected={connected} t={t}
        onClose={onClose} host={actionsHost} />
    </Suspense>}
  </WorkspaceDrawerTab>;
}
