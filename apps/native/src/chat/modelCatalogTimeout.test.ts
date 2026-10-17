import { afterEach, expect, it, vi } from 'vitest';
import { ChatRpc } from '../../../../shared/remote-chat/rpc';
import type { RpcMessage } from '../../../../shared/remote-chat/protocol';
import { createGuiAccountsClient } from '../../../../shared/remote-chat/client/guiAccounts';

afterEach(() => vi.useRealTimers());

function harness() {
  const messages: RpcMessage[] = [];
  const rpc = new ChatRpc({ prefix: 'catalog', event: () => {},
    send: async message => { messages.push(message); } });
  const reply = (data: unknown = { models: ['ready'] }) => {
    const request = messages[0];
    if (request.kind !== 'request') throw new Error('Expected a request');
    rpc.receive({ kind: 'response', id: request.id, data });
  };
  return { rpc, messages, reply };
}

it.each(['models', 'modelsRefresh', 'composerSet', 'guiAccountSelect'])(
  'allows host catalog recovery to finish for %s', async operation => {
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

it.each(['models', 'modelsRefresh', 'composerSet', 'guiAccountSelect'])(
  'still bounds stalled %s requests', async operation => {
  vi.useFakeTimers();
  const { rpc } = harness();
  const rejected = vi.fn();
  const request = rpc.request('request', { operation });
  void request.catch(rejected);
  const result = expect(request).rejects.toThrow('电脑暂未确认结果');
  await vi.advanceTimersByTimeAsync(149_999);
  expect(rejected).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(rejected).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  rpc.close();
});

it.each(['account', 'provider'] as const)('keeps %s switching pending at 60 seconds and accepts success at 120',
  async kind => {
    vi.useFakeTimers();
    const { rpc, messages, reply } = harness();
    const client = createGuiAccountsClient({
      request: body => rpc.request('request', body), subscribe: () => () => {},
    });
    const selection = { kind, id: 'selected' };
    const resolved = vi.fn();
    const rejected = vi.fn();
    const result = client.select(selection);
    void result.then(resolved, rejected);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(messages).toEqual([expect.objectContaining({
      body: { operation: 'guiAccountSelect', selection },
    })]);
    await vi.advanceTimersByTimeAsync(60_000);
    reply(selection);
    await expect(result).resolves.toEqual(selection);
    expect(resolved).toHaveBeenCalledExactlyOnceWith(selection);
    expect(rejected).not.toHaveBeenCalled();
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
