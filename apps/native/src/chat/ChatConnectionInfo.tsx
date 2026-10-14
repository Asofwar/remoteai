import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RemoteDevice } from '../types';
import type { ChatState } from './types';
import type { ChatController } from '../../../../shared/remote-chat/client/controller';
import { ChatProjectPicker } from './ChatProjectPicker';
import { ChatReconnectButton } from './ChatReconnectButton';
import { HOST_IDENTITY_CHANGED } from '../../../../shared/remote-chat/trustedHost';
import { HostIdentityVerification } from './HostIdentityVerification';
import { ChatConnectionHealth } from './ChatConnectionHealth';
import { useConnectionInfoStyles } from './connectionInfoStyles';

const modeLabels = { get connecting() { return t("正在连接…"); }, direct: 'P2P', relay: 'Relay', get offline() { return t("等待重新连接"); } };

export function ChatConnectionInfo({ state, controller, device, active }: {
  state: ChatState; controller: ChatController; device?: RemoteDevice; active: boolean;
}) {
  const styles = useConnectionInfoStyles();
  useLanguage();
  const [picking, setPicking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const canChoose = active && state.ready && !state.selected && !state.sending;
  const canReconnect = active && device && !state.ready && !state.connecting && state.mode !== 'connecting';
  let status = modeLabels[state.mode];
  if (!state.ready && (state.mode === 'direct' || state.mode === 'relay')) status = t("正在同步聊天…");
  if (!state.ready && state.error && !state.connecting) status = t("连接未完成");
  useEffect(() => { if (!canChoose) setPicking(false); }, [canChoose]);
  return <>
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.text, styles.name]}>
          {device ? device.name : t("选择电脑，开始聊天")}</Text>
        {device && <Pressable accessibilityRole="button" style={styles.status}
          accessibilityLabel={`${status} · ${t('连接体检')}`} accessibilityState={{ expanded: healthOpen }}
          onPress={() => setHealthOpen(true)}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.text}>{' · '}{status}</Text>
        </Pressable>}
      </View>
      <View style={styles.actions}>
        {state.error === HOST_IDENTITY_CHANGED && <Pressable style={styles.action}
          onPress={() => setVerifying(true)} accessibilityRole="button">
          <Text style={styles.actionText}>{t("核对电脑身份")}</Text>
        </Pressable>}
        {canReconnect && <ChatReconnectButton retryAt={state.retryAt} onPress={controller.connectNow} />}
        {!state.selected && !canReconnect && <Pressable style={styles.action}
          accessibilityRole="button" accessibilityLabel={t("选择项目")} disabled={!canChoose}
          accessibilityState={{ disabled: !canChoose }} onPress={() => setPicking(true)}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.text}>
            {state.draftProject?.label || t("未选择项目")}</Text>
        </Pressable>}
      </View>
    </View>
    {healthOpen && <ChatConnectionHealth state={state} device={device}
      reconnect={controller.connectNow} close={() => setHealthOpen(false)} />}
    {picking && canChoose && <ChatProjectPicker cwd={state.draftProject?.cwd}
      load={controller.loadProjectDirectories} close={() => setPicking(false)}
      choose={(project) => { controller.chooseDraftProject(project); setPicking(false); }} />}
    {verifying && <HostIdentityVerification confirm={controller.confirmHostIdentity} close={() => setVerifying(false)} />}
  </>;
}
