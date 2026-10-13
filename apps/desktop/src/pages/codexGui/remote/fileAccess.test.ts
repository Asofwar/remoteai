import { beforeEach, expect, it, vi } from 'vitest';
import { RemoteFileAccess } from './fileAccess';
import { TerminalLinkTunnels } from '../terminal/linkTunnel';
import { createGuiFilesClient } from '../../../../../../shared/remote-chat/files';

vi.mock('../terminal/linkTunnel', () => ({ TerminalLinkTunnels: vi.fn(class {
  resolve = vi.fn(async (_id, url: string) => url.replace(/http:\/\/[^/]+/, 'http://127.0.0.1:54321'));
  close = vi.fn();
}) }));
beforeEach(() => vi.clearAllMocks());
const preview = { sessionId: 'preview', path: 'F:/remote/a.md', name: 'a.md', kind: 'markdown',
  text: '# Remote', url: 'http://127.0.0.1:4321/token/a.md' };

it('tunnels previews and adjacent assets and authorizes only the returned local listener', async () => {
  const request = vi.fn(async (body: { operation: string }) => {
    if (body.operation === 'guiFilePreviewOpen') return preview;
    if (body.operation === 'guiResourceOpen') return 'scope';
  });
  const client = createGuiFilesClient(request as Parameters<typeof createGuiFilesClient>[0]);
  const access = new RemoteFileAccess(client);
  expect(await access.open({ threadId: 'remote', path: 'a.md' })).toMatchObject({
    url: 'http://127.0.0.1:54321/token/a.md', path: 'F:/remote/a.md' });
  expect(request).toHaveBeenCalledWith({ operation: 'guiFilePreviewHost', id: 'preview', host: '127.0.0.1:54321' });
  await access.close('preview');
  expect(request).toHaveBeenCalledWith({ operation: 'guiFilePreviewClose', id: 'preview' });
  expect(request).toHaveBeenCalledWith({ operation: 'guiResourceClose', id: 'scope' });
});

it('never falls back to viewing-computer loopback when the remote tunnel fails', async () => {
  const request = vi.fn(async () => { throw new Error('Disconnected'); });
  const access = new RemoteFileAccess(createGuiFilesClient(request));
  await expect(access.resolveWebsite('http://localhost:3000')).rejects.toThrow('Disconnected');
  await expect(access.resolveWebsite('https://example.com')).resolves.toBe('https://example.com');
  access.dispose();
  await expect(access.resolveWebsite('http://localhost:3000')).rejects.toThrow('连接已断开');
});

it('closes a preview arriving after its connection was disposed', async () => {
  let finish!: (value: unknown) => void;
  const request = vi.fn(async (body: { operation: string }) => body.operation === 'guiFilePreviewOpen'
    ? new Promise(resolve => { finish = resolve; }) : undefined);
  const access = new RemoteFileAccess(createGuiFilesClient(request as Parameters<typeof createGuiFilesClient>[0]));
  const pending = access.open({ path: 'a.md', threadId: 'remote' });
  access.dispose(); finish(preview);
  await expect(pending).rejects.toThrow('连接已断开');
  expect(request).toHaveBeenCalledWith({ operation: 'guiFilePreviewClose', id: 'preview' });
  expect(TerminalLinkTunnels).not.toHaveBeenCalled();
});
