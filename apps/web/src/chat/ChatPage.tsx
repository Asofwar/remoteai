import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import type { AuthSession, RemoteDevice } from '../types';
import { ConnectedChat } from './ConnectedChat';
import { ChatTools } from './ChatTools';
import { useChat } from './useChat';
import { useChatViewport } from './useChatViewport';
import { loadLastConnectedDevice, saveLastConnectedDevice } from './lastConnectedDevice';
import { useDownloadConnection } from '../downloads/useDownloadConnection';
import { useRetainedChatDevices } from '../../../../shared/remote-chat/useRetainedChatDevices';

interface Props { session: AuthSession; devices: RemoteDevice[]; active: boolean }

export function ChatPage({ session, devices, active }: Props) {
  useLanguage();
  const [lastConnectedDeviceId] = useState(() => loadLastConnectedDevice(session));
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const device = devices.find((entry) => entry.deviceId === deviceId)
    ?? devices.find((entry) => entry.deviceId === lastConnectedDeviceId && entry.online)
    ?? devices.find((entry) => entry.online);
  useEffect(() => {
    if (device && deviceId !== device.deviceId) setDeviceId(device.deviceId);
  }, [deviceId, device?.deviceId]);
  useChatViewport(active);
  const scope = JSON.stringify([session.baseUrl, session.email]);
  const retained = useRetainedChatDevices({ scope, devices, selectedId: device?.deviceId });
  const chats = device ? retained : [...retained, undefined];
  return <section className="chat-page" hidden={!active} aria-label={t("Codex 聊天")}>
    {chats.map(chatDevice => {
      const selected = chatDevice?.deviceId === device?.deviceId;
      return <div className="chat-device-session" hidden={!selected}
        key={JSON.stringify([scope, chatDevice?.deviceId])}>
        <WebChat session={session} device={chatDevice} devices={devices} selected={selected}
          active={active && selected} chooseDevice={setDeviceId} />
      </div>;
    })}
  </section>;
}

function WebChat({ session, device, selected, ...props }: Props & {
  device?: RemoteDevice; selected: boolean; chooseDevice: (id: string) => void;
}) {
  const chat = useChat(session, device?.deviceId ?? '', props.active && Boolean(device));
  useEffect(() => {
    if (selected && chat.state.ready && device) saveLastConnectedDevice(session, device.deviceId);
  }, [selected, chat.state.ready, device?.deviceId, session.baseUrl, session.email]);
  useDownloadConnection({ session, deviceId: device?.deviceId ?? '', deviceName: device?.name ?? '',
    controller: chat.controller, enabled: selected });
  return <ConnectedChat {...props} chat={chat} device={device} email={session.email}
    headerEnd={<div className="chat-header-tools">
      <ChatTools client={chat.controller.guiTools} active={props.active}
        connected={chat.state.ready} deviceName={device?.name}
        cwd={chat.state.selected?.cwd ?? chat.state.draftProject?.cwd ?? ''} />
    </div>}
    scope={JSON.stringify([session.baseUrl, session.email, device?.deviceId ?? ''])} />;
}
