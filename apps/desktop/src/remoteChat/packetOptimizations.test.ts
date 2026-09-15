import { afterEach, expect, it, vi } from 'vitest';
import { Acknowledgements } from '../../../../shared/remote-chat/acknowledgements';
import { DirectPackets, directPackets } from '../../../../shared/remote-chat/directPackets';
import { DownloadProgress } from '../../../../shared/remote-chat/downloadProgress';

afterEach(() => vi.useRealTimers());
it('sends one cumulative acknowledgement for a burst and promptly acknowledges a final partial burst', () => {
  vi.useFakeTimers();
  const acks = new Acknowledgements();
  const send = vi.fn();
  for (let sequence = 1; sequence <= 8; sequence++) acks.schedule({ kind: 'ack', sequence }, send);
  expect(send).toHaveBeenCalledExactlyOnceWith({ kind: 'ack', sequence: 8 });
  acks.schedule({ kind: 'ack', sequence: 9 }, send);
  vi.advanceTimersByTime(8);
  expect(send).toHaveBeenLastCalledWith({ kind: 'ack', sequence: 9 });
  acks.schedule({ kind: 'ack', sequence: 10 }, send); acks.clear(); vi.runAllTimers();
  expect(send).toHaveBeenCalledTimes(2);
});

it('keeps old-peer packets unchanged and batches only negotiated bulk traffic', () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const batch = new DirectPackets({ send, failed: vi.fn() });
  batch.send('ab', true); expect(send).toHaveBeenCalledExactlyOnceWith('ab');
  send.mockClear(); batch.enable();
  for (let index = 0; index < 8; index++) batch.send('abcd', true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(directPackets(send.mock.calls[0][0])).toEqual(Array(8).fill('abcd'));
  batch.send('ff', false); expect(send).toHaveBeenLastCalledWith('ff');
  batch.send('aa', true); vi.runAllTimers(); expect(send).toHaveBeenLastCalledWith('aa');
  expect(batch.bufferedAmount).toBe(0);
});

it('bounds direct message size and clears queued packets on path changes', () => {
  vi.useFakeTimers();
  const sent: string[] = [];
  const batch = new DirectPackets({ send: (payload) => sent.push(payload), failed: vi.fn() });
  batch.enable();
  for (let index = 0; index < 8; index++) batch.send('a'.repeat(30_000), true);
  vi.runAllTimers(); expect(sent.every((payload) => payload.length <= 48 * 1024)).toBe(true);
  batch.send('ab', true); batch.clear(); vi.runAllTimers();
  expect(sent).toHaveLength(8);
});

it.each(['[]', '[{}]', '["zz"]', JSON.stringify(Array(9).fill('ab')), '["' + 'a'.repeat(50_000) + '"]'])(
  'rejects malformed or oversized batch %#', (payload) => expect(() => directPackets(payload)).toThrow());

it('shows written bytes and speed while limiting UI refreshes', () => {
  const meter = new DownloadProgress();
  expect(meter.update(0, 2 * 1024 * 1024, 0)?.percent).toBe(0);
  expect(meter.update(1024, 2 * 1024 * 1024, 100)).toBeUndefined();
  expect(meter.update(1024 * 1024, 2 * 1024 * 1024, 1000)).toEqual({ percent: 50,
    detail: '1.0 MB / 2.0 MB · 1.0 MB/s' });
  expect(meter.update(2 * 1024 * 1024, 2 * 1024 * 1024, 1001)?.percent).toBe(100);
});
