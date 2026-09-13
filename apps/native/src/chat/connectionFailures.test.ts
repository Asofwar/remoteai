import { afterEach, expect, it, vi } from 'vitest';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import { CONNECTION_ERRORS } from '../../../../shared/remote-chat/connectionErrors';
import { chatHandshake } from '../../../../shared/remote-chat/handshake';
import type { ConnectionEvents } from '../../../../shared/remote-chat/client/connection';

afterEach(() => vi.useRealTimers());

function harness(response: unknown) {
  let events!: ConnectionEvents;
  const request = vi.fn(async (method: string) => {
    if (method !== 'connect') return { data: [], nextCursor: null };
    if (response instanceof Error || typeof response === 'string') throw response;
    return response;
  });
  const controller = new ChatController((callbacks) => {
    events = callbacks;
    return { start() { events.mode('relay'); events.ready(); }, stop() {},
      request: async <T>(method: string) => await request(method) as T };
  });
  controller.start();
  return { controller, request, events };
}

it.each([
  ['请先下载 Codex，即可开始对话。', CONNECTION_ERRORS.missingGui],
  [new Error('Codex 暂时无法启动，请检查 Codex 配置后重试。'), CONNECTION_ERRORS.startup],
  [{ protocolVersion: 2, approvals: [] }, CONNECTION_ERRORS.incompatible],
])('retains the concrete failure during retries and clears it after recovery', async (response, error) => {
  vi.useFakeTimers();
  const { controller, request } = harness(response);
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.snapshot()).toMatchObject({ ready: false, error });
  await vi.advanceTimersByTimeAsync(3000);
  expect(controller.snapshot()).toMatchObject({ ready: false, error });
  expect(request.mock.calls.filter(([method]) => method === 'connect')).toHaveLength(2);
  request.mockImplementation(async (method) => method === 'connect'
    ? { ...chatHandshake, approvals: [] } : { data: [], nextCursor: null });
  await vi.advanceTimersByTimeAsync(3000);
  expect(controller.snapshot()).toMatchObject({ ready: true, error: '' });
  controller.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not overwrite a disconnected PC reason with a late initialization failure', async () => {
  vi.useFakeTimers();
  const { controller, events, request } = harness([]);
  await vi.advanceTimersByTimeAsync(0);
  let reject!: (error: Error) => void;
  request.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  events.ready();
  events.error(CONNECTION_ERRORS.interrupted);
  events.mode('offline');
  reject(new Error('Codex 已断开连接，请重新连接后继续。'));
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.snapshot()).toMatchObject({ ready: false, error: CONNECTION_ERRORS.interrupted });
  controller.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('retries GUI initialization immediately once, cancelling the pending automatic retry', async () => {
  vi.useFakeTimers();
  const { controller, request, events } = harness(new Error('Codex 暂时无法启动'));
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.snapshot()).toMatchObject({ connecting: false, retryAt: Date.now() + 3000 });
  events.retryAt?.(Date.now() + 1500);
  expect(controller.snapshot().retryAt).toBe(Date.now() + 3000);
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  controller.connectNow();
  controller.connectNow();
  events.ready();
  expect(controller.snapshot()).toMatchObject({ ready: false, connecting: true, retryAt: null });
  await vi.advanceTimersByTimeAsync(3000);
  expect(request.mock.calls.filter(([method]) => method === 'connect')).toHaveLength(2);
  finish({ ...chatHandshake, approvals: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.snapshot()).toMatchObject({ ready: true, connecting: false, retryAt: null });
  controller.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('starts a disconnected transport once and hides the retry action during connection', () => {
  let events!: ConnectionEvents;
  const start = vi.fn(() => events.mode('connecting'));
  const stop = vi.fn(() => events.mode('offline'));
  const controller = new ChatController((callbacks) => {
    events = callbacks;
    return { start, stop, request: async <T>() => [] as T };
  });
  controller.start();
  events.mode('offline');
  events.retryAt?.(Date.now() + 30_000);
  controller.connectNow();
  controller.connectNow();
  expect(start).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalledOnce();
  expect(controller.snapshot()).toMatchObject({ connecting: true, retryAt: null });
  controller.stop();
});
