import { useEffect, useState } from 'react';
import { Popover } from 'antd';
import { FolderSearch, GitBranch, Monitor, SquareTerminal, Wrench } from 'lucide-react';
import type { GuiToolsClient } from '../../../../shared/remote-chat/guiTools';
import { ChatTerminal } from './ChatTerminal';
import { ChatGit } from './git/ChatGit';
import { RemoteDesktop } from './desktop/RemoteDesktop';
import { t } from '../i18n';
import './git/git.css';
import { ProjectBrowserDrawer } from './projectBrowser/ProjectBrowserDrawer';
import { useDesktopLayout } from '../useDesktopLayout';
import { useProjectBrowsers } from '../../../../shared/project-browser/useProjectBrowsers';

interface Props {
  client: GuiToolsClient; cwd: string; active: boolean; connected: boolean; deviceName?: string;
}
export function ChatTools(props: Props) {
  const browsers = useProjectBrowsers();
  return <>
    <ProjectTools key={props.cwd} {...props} openFiles={() => browsers.open(props.cwd)} />
    {browsers.projects.map(project => <ProjectBrowserDrawer key={project} client={props.client.projectBrowser}
      cwd={project} active={props.active && browsers.visible === project}
      connected={props.connected} onClose={browsers.close} />)}
  </>;
}

function ProjectTools({ client, openFiles, ...props }: Props & { openFiles: () => void }) {
  const wide = useDesktopLayout();
  const [menu, setMenu] = useState(false);
  const [launchId, setLaunchId] = useState(0);
  const [git, setGit] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { if (!props.active) setMenu(false); }, [props.active]);
  return <>
    <Popover trigger="click" placement="bottomRight" arrow={false} open={menu && props.active} onOpenChange={setMenu}
      content={<div className="chat-tools-menu">
        <button type="button" disabled={!props.connected}
          onClick={() => { setMenu(false); setDesktop(true); }}>
          <Monitor size={20} />{t('远程桌面')}</button>
        <button type="button" disabled={!props.connected}
          onClick={() => { setMenu(false); setLaunchId(value => value + 1); }}>
          <SquareTerminal size={20} />{t('终端')}</button>
        <button type="button" onClick={() => { setMenu(false); setGit(true); }}>
          <GitBranch size={20} />{t('Git')}</button>
        {!wide && <button type="button" disabled={!props.connected || !props.cwd}
          onClick={() => { setMenu(false); openFiles(); }}>
          <FolderSearch size={20} />{t('文件浏览')}</button>}
      </div>}>
      <button type="button" className="chat-terminal-toggle" aria-label={t('打开工具')}
        aria-expanded={menu && props.active}>
        <Wrench size={22} /></button>
    </Popover>
    <ChatTerminal {...props} client={client.terminal} launchId={launchId} hideTrigger />
    {git && <ChatGit {...props} client={client.git} onClose={() => setGit(false)} />}
    {desktop && <RemoteDesktop client={client.desktop} active={props.active} connected={props.connected}
      close={() => setDesktop(false)} />}
  </>;
}
