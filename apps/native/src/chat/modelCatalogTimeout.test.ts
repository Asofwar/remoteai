import { afterEach, expect, it, vi } from 'vitest';
import { ChatRpc } from '../../../../shared/remote-chat/rpc';
import type { RpcMessage } from '../../../../shared/remote-chat/protocol';

afterEach(() => vi.useRealTimers());

function harness() {
  const messages: RpcMessage[] = [];
  const rpc = new ChatRpc({ prefix: 'catalog', event: () => {},
    send: async message => { messages.push(message); } });
  const reply = () => {
    const request = messages[0];
    if (request.kind !== 'request') throw new Error('Expected a request');
    rpc.receive({ kind: 'response', id: request.id, data: { models: ['ready'] } });
  };
  return { rpc, messages, reply };
}

it.each(['models', 'composerSet'])('allows host catalog recovery to finish for %s', async operation => {
  vi.useFakeTimers();
  const { rpc, messages, reply } = harness();
  const result = rpc.request('request', { operation });
  await vi.advanceTimersByTimeAsync(140_000);
  expect(messages).toHaveLength(1);
  reply();
  await expect(result).resolves.toEqual({ models: ['ready'] });
  expect(vi.getTimerCount()).toBe(0);
  rpc.close();
});

it.each(['models', 'composerSet'])('still bounds stalled %s reads', async operation => {
  vi.useFakeTimers();
  const { rpc } = harness();
  const result = expect(rpc.request('request', { operation })).rejects.toThrow('电脑暂未确认结果');
  await vi.advanceTimersByTimeAsync(150_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
  rpc.close();
});

it('preserves the one-minute timeout for ordinary requests', async () => {
  vi.useFakeTimers();
  const { rpc } = harness();
  const result = expect(rpc.request('request', { operation: 'list' })).rejects.toThrow('电脑暂未确认结果');
  await vi.advanceTimersByTimeAsync(60_000);
  await result;
  rpc.close();
});
