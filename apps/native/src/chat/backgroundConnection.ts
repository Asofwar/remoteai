import { t } from '../i18n';
import { AppRegistry, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { subscribeInterfaceLanguage } from '../../../../shared/i18n/interfaceLanguage';

export const CHAT_SERVICE_STOPPED = 'codexChatConnectionStopped';
export interface ConnectionLabels {
  channel: string; channelDescription: string;
  chatTitle: string; chatText: string; mappingTitle: string; mappingText: string;
}
interface ChatBackgroundModule {
  start: () => Promise<boolean>; stop: () => Promise<void>;
  setPortMappingEnabled?: (enabled: boolean) => Promise<boolean>;
  /** Missing in older native builds, which keep their built-in Chinese notification copy. */
  setLabels?: (labels: ConnectionLabels) => void;
}
const native: ChatBackgroundModule | undefined = NativeModules.ChatBackground;
let operation = Promise.resolve();
let chatEnabled = false;
const mappingLeases = new Set<symbol>();

export const connectionLabels = (): ConnectionLabels => ({
  channel: t('聊天连接'), channelDescription: t('在后台接收电脑上的聊天回复'),
  chatTitle: t('Remote AI 聊天'), chatText: t('后台接收电脑回复，点击返回应用'),
  mappingTitle: t('Remote AI 端口映射'), mappingText: t('端口映射正在运行，点击返回应用'),
});

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('CodexChatConnection', () => () => new Promise<void>((resolve) => {
    const subscription = DeviceEventEmitter.addListener(CHAT_SERVICE_STOPPED, () => {
      subscription.remove(); resolve();
    });
  }));
  if (typeof native?.setLabels === 'function') {
    // The notification and its system channel are native, so they follow each interface language change.
    const updateLabels = () => native.setLabels?.(connectionLabels());
    updateLabels();
    subscribeInterfaceLanguage(updateLabels);
  }
}

export function keepChatConnected(enabled: boolean): Promise<void> {
  chatEnabled = enabled;
  const next = operation.then(async () => {
    if (Platform.OS !== 'android') return;
    if (!native) throw new Error(t("请安装新版应用以使用后台聊天。"));
    if (enabled) await native.start();
    else if (!mappingLeases.size) await native.stop();
  });
  operation = next.catch(() => undefined);
  return next;
}

/** Each listener owns one lease; stopping chat or another mapping cannot release it. */
export async function retainPortMappingConnection(): Promise<() => Promise<void>> {
  if (Platform.OS !== 'android') return async () => undefined;
  const lease = Symbol('port-mapping');
  const next = operation.then(async () => {
    if (!native?.setPortMappingEnabled) throw new Error('请更新应用后使用端口映射。');
    if (!mappingLeases.size && !await native.setPortMappingEnabled(true)) {
      throw new Error('请返回应用后重新启动映射。');
    }
    mappingLeases.add(lease);
  });
  operation = next.catch(() => undefined);
  await next;
  return () => {
    const release = operation.then(async () => {
      if (!mappingLeases.delete(lease) || mappingLeases.size) return;
      await native?.setPortMappingEnabled?.(false);
      if (!chatEnabled) await native?.stop();
    });
    operation = release.catch(() => console.warn('Could not release mapping background connection.'));
    return operation;
  };
}
