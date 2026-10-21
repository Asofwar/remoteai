import { Platform } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import type { BrowserHost } from '../../../../shared/project-browser/entryActions';
import type { ProjectBrowserClient } from '../../../../shared/project-browser/protocol';
import { downloadProjectEntry } from '../../../../shared/project-browser/downloads';
import { downloadManager } from '../downloads/manager';
import { nativeDownloadTarget } from './fileDownloadTarget';

export function projectBrowserHost(client: ProjectBrowserClient, signal: AbortSignal): BrowserHost {
  return {
    copyPath: async path => { await setStringAsync(path); },
    download: async file => {
      const connection = downloadManager.connection();
      if (Platform.OS === 'android' && connection?.projectBrowser === client) {
        await downloadManager.enqueue({ ...file, scope: 'project', owner: connection.owner,
          deviceId: connection.deviceId, deviceName: connection.deviceName });
        return '已加入下载列表。';
      }
      if (!client.transfer) throw new Error('暂时无法下载，请重新连接后重试。');
      await downloadProjectEntry({ client: client.transfer, file, signal, transferId: randomUUID(),
        target: nativeDownloadTarget, progress: () => undefined });
      return '下载完成。';
    },
  };
}
