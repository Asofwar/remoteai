import { useState } from 'react';
import { FolderSearch } from 'lucide-react';
import type { ProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import { ProjectBrowserDrawer } from './ProjectBrowserDrawer';
import { t, useLanguage } from '../../i18n';

export function ProjectBrowserButton({ client, cwd, connected, active, className, desktopStyle }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; active: boolean;
  className?: string; desktopStyle?: boolean;
}) {
  useLanguage();
  // Retain the opened project and its draft even if the conversation changes behind the drawer.
  const [openedProject, setOpenedProject] = useState<string>();
  return <>
    <button type="button" className={className} disabled={!active || !connected || !cwd}
      aria-label={t('文件浏览')} aria-haspopup="dialog" aria-expanded={!!openedProject}
      onClick={() => setOpenedProject(value => value ?? cwd)}>
      <FolderSearch size={16} /><span>{t('文件浏览')}</span></button>
    {openedProject && <ProjectBrowserDrawer client={client} cwd={openedProject} connected={connected}
      active={active} desktopStyle={desktopStyle} onClose={() => setOpenedProject(undefined)} />}
  </>;
}
