import { expect, it, vi } from 'vitest';
import { DesktopClipboard } from '../../../../shared/remote-desktop/clipboardTransfer';
import { CLIPBOARD_CHUNK_BYTES, decodeClipboardBytes, type ClipboardMessage }
  from '../../../../shared/remote-desktop/clipboard';

it('serializes large clipboard uploads into acknowledged chunks and commits after the final chunk', async () => {
  const requests: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => {
    requests.push(message);
    queueMicrotask(() => clipboard.receive({ kind: 'clipboard', requestId: message.requestId, result: {} }));
    return true;
  });
  const content = { format: 'text' as const, text: 'hello 世界 '.repeat(12000) };
  const progress = vi.fn();
  await clipboard.write(content, true, progress);
  const chunks = requests.flatMap(message => message.request.action === 'append' ? [message.request] : []);
  expect(chunks.length).toBeGreaterThan(1);
  const bytes = chunks.map(chunk => decodeClipboardBytes(chunk.data));
  for (const chunk of bytes) expect(chunk.length).toBeLessThanOrEqual(CLIPBOARD_CHUNK_BYTES);
  expect(JSON.parse(new TextDecoder().decode(Buffer.concat(bytes)))).toEqual(content);
  expect(requests.at(-2)?.request).toEqual({ action: 'commit', paste: true });
  expect(requests.at(-1)?.request).toEqual({ action: 'clear' });
  expect(progress.mock.lastCall?.[0]).toBe(progress.mock.lastCall?.[1]);
});
it('rejects pending clipboard requests on disconnect without waiting for timeouts', async () => {
  const clipboard = new DesktopClipboard(() => true);
  const reading = clipboard.read();
  clipboard.stop();
  await expect(reading).rejects.toThrow('连接已结束');
});
it('preserves host clipboard errors and does not commit partial uploads', async () => {
  const requests: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => {
    requests.push(message);
    queueMicrotask(() => clipboard.receive({ kind: 'clipboard', requestId: message.requestId,
      error: '无法访问剪贴板，请重新复制后再试。' }));
    return true;
  });
  await expect(clipboard.write({ format: 'text', text: 'test' })).rejects.toThrow('无法访问剪贴板');
  expect(requests.some(message => message.request.action === 'commit')).toBe(false);
});

it('keeps four chunks in flight and waits for every acknowledgement before committing', async () => {
  const requests: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => { requests.push(message); return true; });
  const sending = clipboard.write({ format: 'text', text: 'x'.repeat(CLIPBOARD_CHUNK_BYTES * 6) });
  const acknowledge = (message: ClipboardMessage) => clipboard.receive({
    kind: 'clipboard', requestId: message.requestId, result: {},
  });
  await Promise.resolve(); acknowledge(requests[0]);
  await vi.waitFor(() => expect(requests.filter(item => item.request.action === 'append')).toHaveLength(4));
  for (let index = 1; index <= 7; index++) {
    await vi.waitFor(() => expect(requests[index]?.request.action).toBe('append'));
    acknowledge(requests[index]);
  }
  await vi.waitFor(() => expect(requests.at(-1)?.request.action).toBe('commit'));
  acknowledge(requests.at(-1)!);
  await vi.waitFor(() => expect(requests.at(-1)?.request.action).toBe('clear'));
  acknowledge(requests.at(-1)!); await sending;
});

it('accepts native copy without transferable data and never retries a cut', async () => {
  const requests: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => {
    requests.push(message);
    queueMicrotask(() => clipboard.receive({ kind: 'clipboard', requestId: message.requestId, result: {} }));
    return true;
  });
  await expect(clipboard.copy('cut')).resolves.toBeUndefined();
  expect(requests.map(message => message.request)).toEqual([{ action: 'copy', shortcut: 'cut' }, { action: 'clear' }]);
});

it('preserves host clipboard revisions across the upload and recognizes completed native pastes', async () => {
  const requests: ClipboardMessage[] = [];
  const clipboard = new DesktopClipboard(message => {
    requests.push(message);
    const result = message.request.action === 'paste'
      ? (message.request.preferLocal ? { pasted: false, revision: '42' } : { pasted: true }) : {};
    queueMicrotask(() => clipboard.receive({ kind: 'clipboard', requestId: message.requestId, result }));
    return true;
  });
  const revision = await clipboard.paste(true);
  await clipboard.write({ format: 'text', text: 'local' }, true, undefined, revision);
  expect(requests.find(message => message.request.action === 'commit')?.request)
    .toEqual({ action: 'commit', paste: true, expectedRevision: '42' });
  await expect(clipboard.paste(false)).resolves.toBeUndefined();
});
