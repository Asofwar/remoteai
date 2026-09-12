// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LinkOptions } from '../../../../shared/remote-chat/linkOptions';
import { ChatHost } from './host';

const state = vi.hoisted(() => ({ options: undefined as LinkOptions | undefined,
  relay: vi.fn(), close: vi.fn() }));
vi.mock('../pages/codexGui/api', () => ({ guiApi: { subscribe: vi.fn(async () => vi.fn()) } }));
vi.mock('../pages/codexGui/webEvents', () => ({ subscribeGuiEvent: vi.fn(async () => vi.fn()) }));
vi.mock('./operations', () => ({ ChatOperations: class {} }));
vi.mock('../../../../shared/remote-chat/link', () => ({ ChatLink: class {
  constructor(options: LinkOptions) { state.options = options; }
  setRelayAvailable = state.relay;
  close = state.close;
} }));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onerror?: () => void;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: string }) => void;
  close = vi.fn();
  send = vi.fn();
  constructor() { Socket.instances.push(this); }
  receive(frame: object) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
const token = (sub: string, revision = 1) => `header.${btoa(JSON.stringify({ sub, revision }))}.signature`;
const changed = vi.fn();
let host: ChatHost;
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000); vi.clearAllMocks(); Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  host = new ChatHost({ websocketUrl: 'wss://test', deviceId: 'pc', accessToken: token('owner') }, changed);
  Socket.instances[0].onopen?.();
  Socket.instances[0].receive({ type: 'peer-open', sessionId: 'session', publicKey: 'ab'.repeat(32), iceServers: [],
    transportVersion: 2, resumeToken: 'cd'.repeat(32), expiresAt: Date.now() + 120_000 });
  state.options!.mode('direct');
  await vi.advanceTimersByTimeAsync(0);
});
afterEach(() => { host.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps the active desktop host and its session while re-registering a failed socket', async () => {
  const first = Socket.instances[0];
  first.onclose?.({ code: 1006 });
  expect(host.alive).toBe(true);
  expect(state.close).not.toHaveBeenCalled();
  expect(changed).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(1500);
  const second = Socket.instances[1];
  second.onopen?.();
  expect(JSON.parse(second.send.mock.calls[0][0])).toMatchObject({
    sessions: [{ sessionId: 'session', resumeToken: 'cd'.repeat(32) }],
  });
  first.onclose?.({ code: 4001 });
  second.receive({ type: 'registered' });
  second.receive({ type: 'resumed', sessionId: 'session', expiresAt: Date.now() + 120_000 });
  expect(state.relay).toHaveBeenLastCalledWith(true);
  expect(state.close).not.toHaveBeenCalled();
});

it('retains sessions on same-owner credential renewal, but refuses to reuse them for another account', () => {
  expect(host.updateConfig({ ...host.config, accessToken: token('owner', 2) })).toBe(true);
  expect(state.close).not.toHaveBeenCalled();
  expect(host.updateConfig({ ...host.config, accessToken: token('other') })).toBe(false);
});

it('honors an authorization close following an error and removes every timer on shutdown', async () => {
  Socket.instances[0].onerror?.();
  Socket.instances[0].onclose?.({ code: 4001 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(host.alive).toBe(false);
  expect(state.close).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the original expiry deadline when the coordinator cannot renew the session', async () => {
  Socket.instances[0].onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(120_001);
  expect(state.close).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith(false);
});
