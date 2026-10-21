import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DownloadManagerPage } from '../src/downloads/DownloadManagerPage';
import { downloadManager, downloadOwner } from '../src/downloads/manager';
import type { AuthSession } from '../src/types';
import type { DownloadClient } from '../../../shared/remote-chat/downloads';
import { setInterfaceLanguage } from '../../../shared/i18n/interfaceLanguage';

setInterfaceLanguage('zh');
const session: AuthSession = { baseUrl: 'https://download.test', email: 'fixture@download.test',
  accessToken: 'fixture', refreshToken: 'fixture' };
const owner = downloadOwner(session);
const filename = 'RemoteAI-2.0.12-android.apk';
const content = 'Download sharing fixture';
const client: DownloadClient = {
  open: async () => ({ id: '11111111-1111-4111-8111-111111111111', name: filename,
    size: content.length, mimeType: 'application/vnd.android.package-archive', revision: 'fixture' }),
  read: async ({ offset, length }) => ({ offset, data: btoa(content.slice(offset, offset + length)) }),
  close: async () => {},
  browse: async () => ({ directory: 'C:/project', parent: null, entries: [], truncated: false }),
};
const files = { open: async () => client.open({ scope: 'computer', path: filename, transferId: 'fixture' }),
  read: client.read, close: client.close };

function DownloadManagerFixture() {
  useEffect(() => {
    downloadManager.bind({ owner, deviceId: 'fixture-pc', deviceName: 'ZH', ready: true, mode: 'direct',
      windowSize: 2, cwd: 'C:/project', client, files });
    void downloadManager.initialize().then(async () => {
      if (!downloadManager.snapshot().length) await downloadManager.enqueue({
        owner, deviceId: 'fixture-pc', deviceName: 'ZH', scope: 'computer', path: filename,
      });
    });
    return () => downloadManager.unbind(files);
  }, []);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}>
    <DownloadManagerPage session={session} onBack={() => {}} />
  </SafeAreaView></SafeAreaProvider>;
}

registerRootComponent(DownloadManagerFixture);
