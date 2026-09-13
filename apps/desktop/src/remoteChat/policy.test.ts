// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_POLICY, base64Bytes, checkDownloadSize, MIB, setChatPolicy }
  from '../../../../shared/remote-chat/policy';
import { compressChatImage } from '../../../../shared/remote-chat/compressImage';
import { sliceHistory } from '../../../../shared/remote-chat/historyPage';
import type { Thread } from '../../../../shared/remote-chat/client/types';
import { ChatOperations } from './operations';
import { guiApi } from '../pages/codexGui/api';
import { downloadChatImage } from '../../../web/src/chat/downloadImage';

vi.mock('../pages/codexGui/api', () => ({ guiApi: { request: vi.fn(), connect: vi.fn() } }));
afterEach(() => { setChatPolicy(DEFAULT_CHAT_POLICY); vi.resetAllMocks(); });

it('checks the current limit before starting a web download, including previously cached images', () => {
  const original = 'data:image/png;base64,' + 'YWFh'.repeat(Math.ceil(MIB / 3));
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileDownloadMaxMb: 1 });
  expect(() => downloadChatImage(original)).toThrow('1 MB');
  expect(document.querySelector('a[download]')).toBeNull();
});

it('applies changed history page sizes without moving the previously loaded boundary', () => {
  const thread = { id: 'chat', turns: [
    { id: 'turn', items: Array.from({ length: 20 }, (_, id) => ({ id: `${id}` })) },
  ] } as Thread;
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, historyPageSize: 3 });
  const first = sliceHistory(thread);
  expect(first.thread.turns?.[0].items).toHaveLength(3);
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, historyPageSize: 5 });
  const next = sliceHistory(thread, { start: first.page.start, older: true });
  expect(next.thread.turns?.[0].items).toHaveLength(8);
  expect(next.page.hasMore).toBe(true);
});

it('overrides client-supplied pagination and preview limits and preserves retried request bodies', async () => {
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, threadPageSize: 7, filePreviewMaxMb: 1 });
  vi.mocked(guiApi.request).mockResolvedValue({ data: [], nextCursor: null });
  const operations = new ChatOperations();
  const request = { kind: 'request' as const, id: 'page', method: 'request' as const,
    body: { operation: 'list', archived: false, cursor: 'next', limit: 100 } };
  await operations.execute(request);
  await operations.execute(request);
  expect(guiApi.request).toHaveBeenCalledTimes(1);
  expect(guiApi.request).toHaveBeenCalledWith({ ...request.body, limit: 7 });
  expect(request.body.limit).toBe(100);
  await operations.execute({ ...request, id: 'preview', body: {
    operation: 'textPreview', threadId: 'chat', path: 'text.txt', maxBytes: 99999999,
  } } as Parameters<ChatOperations['execute']>[0]);
  expect(guiApi.request).toHaveBeenLastCalledWith(expect.objectContaining({ maxBytes: MIB }));
});

it('compresses actual bytes to the target and reduces dimensions when quality alone is insufficient', async () => {
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, imageMaxEdge: 1024, imageTargetKb: 32 });
  const encode = vi.fn(async (edge: number, quality: number) => ({ value: { edge, quality },
    bytes: edge > 512 ? 50_000 : 30_000 }));
  expect(await compressChatImage(encode)).toEqual({ edge: 512, quality: 0.8 });
  expect(encode).toHaveBeenCalledTimes(4);
  await expect(compressChatImage(async () => ({ value: '', bytes: MIB }))).rejects.toThrow('32 KB');
});

it('counts base64 padding accurately and applies new download limits at the time of saving', () => {
  expect(base64Bytes('data:image/png;base64,YQ==')).toBe(1);
  expect(base64Bytes('YWI=')).toBe(2);
  checkDownloadSize(2 * MIB);
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileDownloadMaxMb: 1 });
  expect(() => checkDownloadSize(MIB)).not.toThrow();
  expect(() => checkDownloadSize(MIB + 1)).toThrow('1 MB');
});
