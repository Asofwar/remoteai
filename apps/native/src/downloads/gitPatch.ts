import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { DownloadClient } from '../../../../shared/remote-chat/downloads';
import { downloadFile } from '../../../../shared/remote-chat/fileDownload';
import { nativeDownloadTarget } from '../chat/fileDownloadTarget';
import { downloadManager } from './manager';

export const gitPatchNotice = Platform.OS === 'android' ? '已加入下载管理。' : '文件已保存';

export async function saveGitPatch(client: DownloadClient, cwd: string, commit: string) {
  const path = `${commit.slice(0, 12)}.patch`;
  if (Platform.OS === 'android') {
    const connection = downloadManager.connection();
    if (!connection?.ready || connection.client !== client) throw new Error('电脑连接后即可创建补丁。');
    await downloadManager.enqueue({ owner: connection.owner, deviceId: connection.deviceId,
      deviceName: connection.deviceName, scope: 'project', cwd, gitCommit: commit, path });
    return;
  }
  await downloadFile({
    client: { ...client, open: (transferId, path) =>
      client.open({ transferId, path, scope: 'project', cwd, gitCommit: commit }) },
    threadId: randomUUID(), path, signal: new AbortController().signal,
    target: nativeDownloadTarget, progress: () => {},
  });
}
