// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { ChatOperations } from './operations';
import { guiApi } from '../pages/codexGui/api';
import { fileDownloadByteLimit } from '../../../../shared/remote-chat/policy';
vi.mock('../pages/codexGui/api', () => ({ guiApi: { connect: vi.fn(), request: vi.fn(), respond: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it.each(['fileOpen', 'fileRead'])('derives %s limits from the actual connection', async (operation) => {
  const body = { operation, threadId: 'chat', path: 'app.exe', maxBytes: Number.MAX_SAFE_INTEGER };
  vi.mocked(guiApi.request).mockResolvedValue({});
  const operations = new ChatOperations();
  await operations.execute({ kind: 'request', id: 'relay', method: 'request', body }, 'relay');
  expect(guiApi.request).toHaveBeenLastCalledWith({ ...body, maxBytes: fileDownloadByteLimit('relay') });
  await operations.execute({ kind: 'request', id: 'direct', method: 'request', body }, 'direct');
  expect(guiApi.request).toHaveBeenLastCalledWith({ ...body, maxBytes: Number.MAX_SAFE_INTEGER });
});

it('does not retain downloaded bytes in the retry cache and still accepts close', async () => {
  vi.mocked(guiApi.request).mockResolvedValue({ offset: 0, data: 'AA==' });
  const operations = new ChatOperations();
  const request = { kind: 'request' as const, id: 'chunk', method: 'request' as const,
    body: { operation: 'fileRead', threadId: 'chat', id: 'handle', offset: 0, length: 1 } };
  await operations.execute(request); await operations.execute(request);
  expect(guiApi.request).toHaveBeenCalledTimes(2);
  const body = { operation: 'fileClose', threadId: 'chat', id: 'handle' };
  await operations.execute({ ...request, id: 'close', body });
  expect(guiApi.request).toHaveBeenLastCalledWith(body);
});
