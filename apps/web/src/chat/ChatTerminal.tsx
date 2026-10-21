import { lazy, Suspense, useContext, useMemo } from 'react';
import { WorkspaceDrawerContext, workspaceTabId } from '../../../../shared/chat/workspaceDrawer';
import { WorkspaceDrawerTab } from '../../../../shared/chat/WorkspaceDrawerTab';
import { Drawer, Spin } from 'antd';
import { SquareTerminal } from 'lucide-react';
import type { GuiToolsClient } from '../../../../shared/remote-chat/guiTools';
import { useRemoteTerminalLauncher } from '../../../../shared/remote-chat/useRemoteTerminalLauncher';
import { remoteTerminalApi } from '../../../../shared/remote-chat/terminalApi';
import { useDesktopLayout } from '../useDesktopLayout';
import { t, useLanguage } from '../i18n';
import './terminal.css';
import { useToolLaunch } from '../../../../shared/remote-chat/useToolLaunch';

const TerminalPanel = lazy(() => import('../../../desktop/src/pages/codexGui/terminal/TerminalPanel'));
const TERMINAL_ICON = <SquareTerminal size={16} />;

/** Switching projects detaches the view; each PC retains the project's terminal sessions. */
export function ChatTerminal({ client, cwd, active, connected, deviceName, launchId = 0, hideTrigger = false }: {
  client: GuiToolsClient['terminal']; cwd: string; active: boolean; connected: boolean; deviceName?: string;
  launchId?: number; hideTrigger?: boolean;
}) {
  useLanguage();
  const desktop = useDesktopLayout();
  const workspace = useContext(WorkspaceDrawerContext);
  const shared = desktop && Boolean(workspace);
  const id = workspaceTabId.terminal(cwd);
  const panel = useRemoteTerminalLauncher({ client, cwd, connected });
  const api = useMemo(() => remoteTerminalApi(client), [client]);
  const visible = active && (shared ? workspace?.tabs.visible && workspace.tabs.selected === id : panel.open);
  const toggle = () => {
    if (!shared) { panel.toggle(); return; }
    if (visible) { workspace?.tabs.hide(); return; }
    workspace?.tabs.open(id);
    if (!panel.open) panel.toggle();
  };
  useToolLaunch(launchId, toggle, connected && !panel.busy);
  const label = visible ? t('收起远程终端') : t('打开远程终端');
  const content = (shown: boolean) => panel.tabs.length ? <Suspense
    fallback={<div className="chat-terminal-loading"><Spin />{t('正在打开终端…')}</div>}>
    <TerminalPanel panel={panel} api={api} active={shown} fill translate={t} notice={panel.error} />
  </Suspense> : <div className="chat-terminal-empty">
    {panel.busy ? <div className="chat-terminal-loading"><Spin />{t('正在打开终端…')}</div>
      : <>{panel.error && <p role="alert">{t(panel.error)}</p>}
        <button type="button" className="chat-button" disabled={!connected} onClick={panel.retry}>
          {panel.error ? t('重试') : t('新建终端')}</button></>}
  </div>;
  return <>
    {!hideTrigger && <button type="button" className="chat-terminal-toggle" aria-label={label} data-error={!!panel.error}
      aria-expanded={visible} disabled={panel.busy || (!connected && !panel.tabs.length && !panel.error)}
      onClick={toggle}>
      <SquareTerminal size={22} /></button>}
    {(panel.open || panel.tabs.length > 0) && (shared ? <WorkspaceDrawerTab active={active && panel.open}
      tab={{ id, title: t('远程终端'), icon: TERMINAL_ICON }}>{content}</WorkspaceDrawerTab>
      : <Drawer open={visible} placement="bottom" height="90%"
      title={t('远程终端')} extra={<span className="chat-terminal-device">{deviceName}</span>}
      rootClassName="chat-terminal-drawer" onClose={panel.hide}
      closable={{ 'aria-label': t('收起终端'), placement: 'end' }}>
      {content(Boolean(visible))}
    </Drawer>)}
  </>;
}
