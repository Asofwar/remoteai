import { useProjectBrowsers } from '../../../../../shared/project-browser/useProjectBrowsers';
import { FolderSearch } from 'lucide-react';
import type { ProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import { ProjectBrowserDrawer } from './ProjectBrowserDrawer';
import { t, useLanguage } from '../../i18n';

export function ProjectBrowserButton({ client, cwd, connected, active, className, desktopStyle }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; active: boolean;
  className?: string; desktopStyle?: boolean;
}) {
  useLanguage();
  const browsers = useProjectBrowsers();
  return <>
    <button type="button" className={className} disabled={!active || !connected || !cwd}
      aria-label={t('文件浏览')} aria-haspopup="dialog" aria-expanded={!!browsers.visible}
      onClick={() => browsers.open(cwd)}>
      <FolderSearch size={16} /><span>{t('文件浏览')}</span></button>
    {browsers.projects.map(project => <ProjectBrowserDrawer key={project} client={client} cwd={project}
      connected={connected} active={active && browsers.visible === project}
      desktopStyle={desktopStyle} onClose={browsers.close} />)}
  </>;
}
