import { afterEach, expect, it, vi } from 'vitest';
import { Assembler } from '../../../../shared/remote-chat/framing';
import { SendQueue } from '../../../../shared/remote-chat/sendQueue';
import type { RpcMessage } from '../../../../shared/remote-chat/protocol';

afterEach(() => vi.useRealTimers());

function harness(capacity = async () => {}) {
  const assembler = new Assembler();
  const received: RpcMessage[] = [];
  const queue = new SendQueue({ capacity, send: (part) => {
    const message = assembler.accept(part);
    if (message) received.push(message);
  } });
  return { queue, received };
}

it('sends a large response without a fixed delay per fragment', async () => {
  vi.useFakeTimers();
  const { queue, received } = harness();
  const history: RpcMessage = { kind: 'response', id: 'history', data: '中文😀'.repeat(50000) };
  await queue.send(history);
  expect(received).toEqual([history]);
  expect(vi.getTimerCount()).toBe(0);
  queue.close();
});

it('delivers a new small response and ordered events ahead of an unfinished history', async () => {
  vi.useFakeTimers();
  const { queue, received } = harness();
  const history: RpcMessage = { kind: 'response', id: 'history', data: 'x'.repeat(1024 * 1024) };
  const sent = queue.send(history);
  const small: RpcMessage = { kind: 'response', id: 'new-chat', data: 'ready' };
  const events: RpcMessage[] = [
    { kind: 'event', event: { delta: 'prefix'.repeat(1000) } },
    { kind: 'event', event: { delta: 'suffix' } },
  ];
  await Promise.all([queue.send(small), ...events.map((event) => queue.send(event)), sent]);
  expect(received).toEqual([...events, small, history]);
  queue.close();
});

it('stays within the receiver assembly window while many histories and events interleave', async () => {
  vi.useFakeTimers();
  const { queue, received } = harness();
  const responses = Array.from({ length: 20 }, (_, index): RpcMessage => ({
    kind: 'response', id: String(index), data: 'x'.repeat(10000 + index * 100),
  }));
  await Promise.all(responses.map((message) => queue.send(message)));
  expect(received).toHaveLength(responses.length);
  expect(received).toEqual(expect.arrayContaining(responses));
  queue.close();
});

it('waits for real capacity and rejects pending transfers when closed', async () => {
  let release!: () => void;
  const { queue, received } = harness(() => new Promise((resolve) => { release = resolve; }));
  const sent = queue.send({ kind: 'response', id: 'history', data: 'waiting' });
  const rejected = expect(sent).rejects.toThrow('电脑已断开连接');
  expect(received).toEqual([]);
  queue.close();
  release();
  await rejected;
  expect(received).toEqual([]);
});
