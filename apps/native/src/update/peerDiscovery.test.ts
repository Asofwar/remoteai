import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchUpdatePeers } from '../../../../shared/app-update/peerDiscovery';
import { updateMirrorUrl } from '../../../../shared/app-update/mirrorUrl';

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = Socket.OPEN;
  onopen = () => {}; onclose = () => {}; onerror = () => {};
  onmessage = (_: { data: string }) => {};
  send = vi.fn(); close = vi.fn();
  constructor() { Socket.latest = this; }
  receive(message: object) { this.onmessage({ data: JSON.stringify(message) }); }
  messages() { return this.send.mock.calls.map(([message]) => JSON.parse(message)); }
}
const artifact = 'a'.repeat(64);
const session = { baseUrl: 'https://example.test/api', accessToken: 'fixture' };
const config = (index: number) => ({ sessionId: `update-00000000-0000-4000-8000-00000000000${index}`,
  secret: 'b'.repeat(64), desktop: false, sameAccount: true, packageProtocol: 2, expiresAt: Date.now() + 60_000,
  servers: ['udp://fixture:1'], stunServers: [] });
const offer = (request: number, indices: number[]) => ({ type: 'update-peer-offers',
  requestId: `android-update-${request}`, artifact, configs: indices.map(config) });
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('starts empty and adds sources appearing during the official download', async () => {
  const onPeers = vi.fn().mockResolvedValue(true);
  const pending = watchUpdatePeers({ session, artifact, onPeers });
  const socket = Socket.latest;
  socket.onopen(); socket.receive({ type: 'devices-snapshot' });
  socket.receive({ type: 'update-peer-unavailable', requestId: 'android-update-1' });
  const lease = await pending;
  expect(lease.configs).toEqual([]);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(socket.messages().at(-1)).toMatchObject({ type: 'update-peer-find', refill: true, ownOnly: true });
  socket.receive(offer(2, [1, 2]));
  await Promise.resolve();
  expect(onPeers).toHaveBeenCalledWith([config(1), config(2)]);
  lease.failed(config(1).sessionId);
  await vi.advanceTimersByTimeAsync(12_000);
  socket.receive(offer(3, [3]));
  await Promise.resolve();
  expect(onPeers).toHaveBeenCalledTimes(2);
  lease.close();
  const count = socket.send.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(socket.send).toHaveBeenCalledTimes(count);
  expect(socket.close).toHaveBeenCalledOnce();
});

it('releases late and rejected grants without losing existing sources', async () => {
  const onPeers = vi.fn().mockResolvedValue(false);
  const pending = watchUpdatePeers({ session, artifact, onPeers });
  const socket = Socket.latest;
  socket.onopen(); socket.receive({ type: 'devices-snapshot' });
  socket.receive(offer(1, [1]));
  const lease = await pending;
  await vi.advanceTimersByTimeAsync(18_000);
  socket.receive(offer(2, [2]));
  expect(socket.messages().at(-1)).toEqual({ type: 'update-peer-done', sessionId: config(2).sessionId });
  await vi.advanceTimersByTimeAsync(6_000);
  socket.receive(offer(3, [3]));
  await Promise.resolve();
  expect(socket.messages().at(-1)).toMatchObject({ type: 'update-peer-done', failed: true, sessionId: config(3).sessionId });
  expect(socket.close).not.toHaveBeenCalled();
  lease.close();
});

it('never expands account scope or accepts duplicate peer grants', async () => {
  const pending = watchUpdatePeers({ session, artifact, onPeers: vi.fn() });
  const rejected = expect(pending).rejects.toThrow();
  const socket = Socket.latest;
  socket.onopen(); socket.receive({ type: 'devices-snapshot' });
  socket.receive({ ...offer(1, [1]), configs: [{ ...config(1), sameAccount: false }] });
  await rejected;
  expect(socket.close).toHaveBeenCalledOnce();
});

it('maps only official stable release files to the configured HTTPS mirror', () => {
  const official = 'https://github.com/piperhex/remoteai/releases/download/v1.2.3/Android.apk';
  expect(updateMirrorUrl(session.baseUrl, official)).toBe('https://example.test/api/update-packages/v1.2.3/Android.apk');
  expect(updateMirrorUrl('http://example.test', official)).toBeUndefined();
  expect(updateMirrorUrl(session.baseUrl, official.replace('piperhex', 'other'))).toBeUndefined();
  expect(updateMirrorUrl(session.baseUrl, official + '?redirect=evil')).toBeUndefined();
});
