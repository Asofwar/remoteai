import { expect, it, vi } from 'vitest';
import { ReliableDelivery } from '../../../../shared/remote-chat/delivery';
import { SendQueue } from '../../../../shared/remote-chat/sendQueue';
import { ChatRpc } from '../../../../shared/remote-chat/rpc';
import { hasUpload, uploadProgress, type TransferProgress } from '../../../../shared/remote-chat/uploadProgress';

it('only counts local files and photos as uploads', () => {
  expect(hasUpload({ attachments: [{ path: 'C:/notes.txt' }, { kind: 'plugin', path: 'plugin://test' }] })).toBe(false);
  expect(hasUpload({ attachments: [{ data: 'YWJj' }] })).toBe(true);
  expect(hasUpload({ images: ['data:image/png;base64,YWJj'] })).toBe(true);
  expect(hasUpload({ images: ['C:/photo.png'] })).toBe(false);
  expect(hasUpload(null)).toBe(false);
});

it('reports progress only after PC acknowledgement and does not count retries twice', async () => {
  const frames: object[] = [];
  const progress = vi.fn();
  const delivery = new ReliableDelivery({ send: (frame) => { frames.push(frame); return true; }, accept: () => {} });
  const queue = new SendQueue({ capacity: async () => {}, send: (part, delivered) => delivery.enqueue(part, delivered) });
  await queue.send({ kind: 'request', id: 'file', method: 'request', body: { data: 'x'.repeat(10000) } }, progress);
  expect(progress).not.toHaveBeenCalled();
  delivery.accept({ kind: 'ack', sequence: 2 }, () => {});
  expect(progress.mock.calls.map(([fraction]) => fraction)).toEqual([0.2, 0.4]);
  delivery.flush(true);
  delivery.accept({ kind: 'ack', sequence: 2 }, () => {});
  expect(progress).toHaveBeenCalledTimes(2);
  delivery.accept({ kind: 'ack', sequence: 5 }, () => {});
  expect(progress.mock.calls.map(([fraction]) => fraction)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  expect(uploadProgress(0.999)).toEqual({ phase: 'uploading', percent: 99 });
  expect(uploadProgress(1)).toEqual({ phase: 'confirming', percent: 100 });
  queue.close();
  delivery.clear();
});

it('stops progress after RPC completion, failure or disconnect', async () => {
  let report: TransferProgress | undefined;
  const progress = vi.fn();
  const rpc = new ChatRpc({ prefix: 'test', event: () => {},
    send: async (_message, callback) => { report = callback; } });
  const request = rpc.request('request', {}, progress);
  report?.(0.5);
  rpc.receive({ kind: 'response', id: 'test:1', data: true });
  await expect(request).resolves.toBe(true);
  report?.(1);
  expect(progress).toHaveBeenCalledTimes(1);
  const failed = rpc.request('request', {}, progress);
  rpc.receive({ kind: 'response', id: 'test:2', error: '文件保存失败' });
  await expect(failed).rejects.toThrow('文件保存失败');
  report?.(1);
  const disconnected = rpc.request('request', {}, progress);
  rpc.close();
  await expect(disconnected).rejects.toThrow('连接已中断');
  report?.(1);
  expect(progress).toHaveBeenCalledTimes(1);
});

it('preserves the progress callback during legacy transport retry', async () => {
  const callbacks: Array<TransferProgress | undefined> = [];
  const progress = vi.fn();
  const rpc = new ChatRpc({ prefix: 'legacy', event: () => {},
    send: async (_message, callback) => { callbacks.push(callback); } });
  const pending = rpc.request('request', {}, progress);
  rpc.retry();
  callbacks[1]?.(0.5);
  expect(progress).toHaveBeenLastCalledWith(0.5);
  rpc.receive({ kind: 'response', id: 'legacy:1', data: true });
  await pending;
  rpc.close();
});
