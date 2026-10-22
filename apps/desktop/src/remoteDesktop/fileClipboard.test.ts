import { expect, it, vi } from 'vitest';
import { DesktopClipboard } from '../../../../shared/remote-desktop/clipboardTransfer';
import { sessionClipboard } from '../../../../shared/remote-desktop/sessionClipboard';
import { CLIPBOARD_CHUNK_BYTES, type ClipboardMessage } from '../../../../shared/remote-desktop/clipboard';
import type { DesktopReceiver } from '../../../../shared/remote-desktop/receiver';

const offer = { id: '12345678-1234-1234-1234-123456789abc', files: [{ name: 'report.txt', size: 3 }] };
function fixture(streaming = true, platform: 'windows' | 'macos' = 'windows') {
  const messages: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => {
    messages.push(message);
    queueMicrotask(() => clipboard.receive({ kind: 'clipboard', requestId: message.requestId, result: {} }));
    return true;
  });
  const session = sessionClipboard(() => ({ clipboard, input: vi.fn() }) as unknown as DesktopReceiver,
    { clipboard: true, clipboardNative: true, clipboardFiles: streaming, platform });
  return { messages, clipboard, session };
}

it('publishes local file metadata without reading bytes until Explorer asks', async () => {
  const { session, messages, clipboard } = fixture();
  const read = vi.fn().mockResolvedValue('YWJj');
  session.registerFiles(offer, read);
  await session.write({ format: 'fileOffer', offer }, true, undefined, 'revision-42');
  expect(read).not.toHaveBeenCalled();
  expect(messages.map(message => message.request)).toEqual([{ action: 'files', request: {
    action: 'publish', offer, paste: true, expectedRevision: 'revision-42',
  } }]);
  clipboard.receive({ kind: 'clipboardFileRead', requestId: 'read-1', offerId: offer.id, index: 0, offset: 0, length: 3 });
  await vi.waitFor(() => expect(messages.at(-1)?.request).toEqual({ action: 'files', request: {
    action: 'reply', requestId: 'read-1', data: 'YWJj',
  } }));
});

it('keeps browser file sending on the native destination copy path', async () => {
  const { session, messages, clipboard } = fixture();
  await session.write({ format: 'files', files: [{ name: 'web.txt', data: 'YWJj' }] });
  const request = messages[0].request;
  if (request.action !== 'files' || request.request.action !== 'publish') throw new Error('Expected offer');
  expect(request.request.offer.files).toEqual([{ name: 'web.txt', size: 3 }]);
  clipboard.receive({ kind: 'clipboardFileRead', requestId: 'web-read', offerId: request.request.offer.id,
    index: 0, offset: 1, length: 2 });
  await vi.waitFor(() => expect(messages.at(-1)?.request).toMatchObject({ action: 'files', request: {
    action: 'reply', data: 'YmM=',
  } }));
});

it.each(['windows', 'macos'] as const)('preserves eager transfer for %s hosts without file promises', async platform => {
  const { session, messages } = fixture(false, platform);
  await session.write({ format: 'files', files: [{ name: 'file.txt', data: 'YWJj' }] });
  expect(messages.some(message => message.request.action === 'begin')).toBe(true);
  expect(messages.some(message => message.request.action === 'files')).toBe(false);
});

it.each([
  { offerId: 'unknown', index: 0, offset: 0, length: 3 },
  { offerId: offer.id, index: 1, offset: 0, length: 3 },
  { offerId: offer.id, index: 0, offset: -1, length: 3 },
  { offerId: offer.id, index: 0, offset: 0, length: CLIPBOARD_CHUNK_BYTES + 1 },
])('rejects out-of-scope or invalid file reads without exposing bytes', async request => {
  const { clipboard, messages } = fixture();
  const read = vi.fn().mockResolvedValue('YWJj'); clipboard.files.register(offer, read);
  await clipboard.files.receive({ kind: 'clipboardFileRead', requestId: 'invalid', ...request });
  expect(read).not.toHaveBeenCalled();
  expect(messages.at(-1)?.request).toEqual({ action: 'files', request: {
    action: 'reply', requestId: 'invalid', data: undefined,
  } });
});

it('revokes source reads when the viewer stops', async () => {
  const { clipboard } = fixture();
  const read = vi.fn(); clipboard.files.register(offer, read); clipboard.stop();
  await clipboard.files.receive({ kind: 'clipboardFileRead', requestId: 'closed', offerId: offer.id,
    index: 0, offset: 0, length: 3 });
  expect(read).not.toHaveBeenCalled();
});

it('reads an echoed promise from its original source without a round trip back into itself', async () => {
  const { clipboard, messages } = fixture();
  const read = vi.fn().mockResolvedValue('YWJj'); clipboard.files.register(offer, read);
  const request = { offerId: offer.id, index: 0, offset: 0, length: 3 };
  expect(await clipboard.files.read(request)).toBe('YWJj');
  expect(read).toHaveBeenCalledWith(request); expect(messages).toEqual([]);
});
