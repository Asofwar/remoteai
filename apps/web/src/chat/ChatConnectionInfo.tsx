import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import type { ChatComputer } from '../../../../shared/remote-chat/devices';
import type { ChatState } from './types';
import type { ChatController } from '../../../../shared/remote-chat/client/controller';
import { ChatReconnectButton } from './ChatReconnectButton';
import { HOST_IDENTITY_CHANGED } from '../../../../shared/remote-chat/trustedHost';
import { HostIdentityVerification } from './HostIdentityVerification';
import { ChatConnectionHealth } from './ChatConnectionHealth';
import { ChatConnectionAction } from './ChatConnectionAction';

const modeLabels = { get connecting() { return t("正在连接…"); }, direct: 'P2P', relay: 'Relay', get offline() { return t("等待重新连接"); } };

export function ChatConnectionInfo({ state, controller, device, active, chooseDevice }: {
  state: ChatState; controller: ChatController; device?: ChatComputer; active: boolean; chooseDevice: () => void;
}) {
  useLanguage();
  const [verifying, setVerifying] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const canReconnect = active && device && !state.ready && !state.connecting && state.mode !== 'connecting';
  let status = modeLabels[state.mode];
  if (!state.ready && (state.mode === 'direct' || state.mode === 'relay')) status = t("正在同步聊天…");
  if (!state.ready && state.error) status = t("连接未完成");
  return <>
    <div className="chat-connection-info chat-muted">
      <div className="chat-connection-summary">
        <ChatConnectionAction className="chat-connection-name" label={t("选择电脑")} onClick={chooseDevice}>
          {device ? device.name : t("选择电脑，开始聊天")}
        </ChatConnectionAction>
        {device && <ChatConnectionAction className="chat-connection-status"
          label={`${status} · ${t('连接体检')}`} expanded={healthOpen} onClick={() => setHealthOpen(true)}>
          {' · '}<span role="status">{status}</span>
        </ChatConnectionAction>}
      </div>
      <div className="chat-connection-actions">
        {state.error === HOST_IDENTITY_CHANGED && <ChatConnectionAction className="chat-connection-verify"
          label={t('核对电脑身份')} onClick={() => setVerifying(true)}>
          {t('核对电脑身份')}</ChatConnectionAction>}
        {canReconnect && <ChatReconnectButton retryAt={state.retryAt} onClick={controller.connectNow} />}
      </div>
    </div>
    {healthOpen && <ChatConnectionHealth state={state} device={device}
      reconnect={controller.connectNow} close={() => setHealthOpen(false)} />}
    {verifying && <HostIdentityVerification confirm={controller.confirmHostIdentity} close={() => setVerifying(false)} />}
  </>;
}
