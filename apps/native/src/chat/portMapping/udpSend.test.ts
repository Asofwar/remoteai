import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { completeUdpSend, UDP_SEND_TIMEOUT_MS } from './udpSend';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('bounds a missing native callback, including the unpatched iOS empty-send behavior', async () => {
  const socket = new EventEmitter();
  const send = completeUdpSend(socket, () => new Promise(() => {}));
  const failed = expect(send).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(UDP_SEND_TIMEOUT_MS);
  await failed;
  expect(socket.eventNames()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['close', 'error'])('releases pending forwarding immediately on socket %s', async event => {
  const socket = new EventEmitter();
  const send = completeUdpSend(socket, () => new Promise(() => {}));
  const failed = expect(send).rejects.toThrow(event === 'close' ? 'closed' : 'native failure');
  socket.emit(event, new Error('native failure'));
  await failed;
  expect(socket.eventNames()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up successful batches and synchronous native failures', async () => {
  const socket = new EventEmitter();
  await completeUdpSend(socket, async () => {});
  await expect(completeUdpSend(socket, () => { throw new Error('native failure'); })).rejects.toThrow('native failure');
  expect(socket.eventNames()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
