import { beforeEach, expect, it, vi } from 'vitest';
import type { DownloadClient } from '../../../../shared/remote-chat/downloads';
import { saveGitPatch } from './gitPatch';

const mock = vi.hoisted(() => ({ platform: { OS: 'android' }, connection: vi.fn(), enqueue: vi.fn(),
  download: vi.fn(), target: vi.fn() }));
vi.mock('react-native', () => ({ Platform: mock.platform }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'transfer' }));
vi.mock('./manager', () => ({ downloadManager: { connection: mock.connection, enqueue: mock.enqueue } }));
vi.mock('../chat/fileDownloadTarget', () => ({ nativeDownloadTarget: mock.target }));
vi.mock('../../../../shared/remote-chat/fileDownload', () => ({ downloadFile: mock.download }));
const client: DownloadClient = { open: vi.fn(), read: vi.fn(), close: vi.fn(), browse: vi.fn() };
const commit = 'a'.repeat(40);
beforeEach(() => {
  vi.clearAllMocks(); mock.platform.OS = 'android';
  mock.connection.mockReturnValue({ owner: 'account', deviceId: 'pc', deviceName: 'PC', ready: true, client });
});
it('queues Android patches for the authenticated computer and preserves the full commit', async () => {
  await saveGitPatch(client, '/repo', commit);
  expect(mock.enqueue).toHaveBeenCalledWith({ owner: 'account', deviceId: 'pc', deviceName: 'PC',
    scope: 'project', cwd: '/repo', path: 'aaaaaaaaaaaa.patch', gitCommit: commit });
});
it('rejects a download connection belonging to another computer', async () => {
  await expect(saveGitPatch({ ...client }, '/repo', commit)).rejects.toThrow('电脑连接后即可创建补丁。');
  expect(mock.enqueue).not.toHaveBeenCalled();
});
it('saves iOS patches through the existing native file export', async () => {
  mock.platform.OS = 'ios';
  await saveGitPatch(client, '/repo', commit);
  const options = mock.download.mock.calls[0][0];
  expect(options.target).toBe(mock.target);
  await options.client.open('transfer', options.path);
  expect(client.open).toHaveBeenCalledWith({ transferId: 'transfer', scope: 'project', cwd: '/repo',
    path: 'aaaaaaaaaaaa.patch', gitCommit: commit });
  expect(mock.enqueue).not.toHaveBeenCalled();
});
