import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MappingStreamClient, type MappingStreamBridge } from '../../../../../../shared/port-mapping/streamClient';
import { BulkCipher } from '../../../../../../shared/remote-chat/bulkCipher';
import { BulkTransport } from '../../../../../../shared/remote-chat/bulkTransport';
import type { MappingStreamLink } from '../../../../../../shared/port-mapping/streamMux';
import { openMappingSocket, type MappingSocket } from '../../../../../../shared/port-mapping/socket';

function fixture(register?: MappingStreamBridge, supported = true) {
  const transport = new BulkTransport({ available: () => true, send: async () => {} });
  transport.setMode('relay');
  const link: MappingStreamLink = { bulk: transport, createBulkCipher: identity => new BulkCipher(new Uint8Array(32),
    { ...identity, sessionId: 'one', desktopKey: 'host', clientKey: 'client', desktop: false }) };
  const request = vi.fn(async (body: object) => 'request' in body ? { type: 'socket', id: 'legacy' } : {});
  const client = new MappingStreamClient({ link: () => link, random: randomBytes, supported: () => supported,
    request: async <T>(body: object) => await request(body) as T, register });
  return { client, request, close: () => { client.close(); transport.close(); } };
}

it('keeps old hosts on RPC and does not register a binary receiver', async () => {
  const register = vi.fn();
  const peer = fixture(register, false);
  try {
    const socket = await peer.client.open('resource', 'http://127.0.0.1:80');
    expect(peer.request).toHaveBeenCalledWith({ operation: 'guiResourceLink', id: 'resource',
      request: { type: 'connect', url: 'http://127.0.0.1:80' } });
    expect(register).not.toHaveBeenCalled(); socket.close();
  } finally { peer.close(); }
});

it('registers before opening and immediately fails pending reads if the native bridge stops', async () => {
  let fail!: () => void;
  const release = vi.fn();
  const peer = fixture(async options => { fail = options.failed; return release; });
  try {
    const socket = await peer.client.open('resource', 'http://127.0.0.1:80');
    const reading = expect(socket.read()).rejects.toThrow('closed');
    fail(); await reading;
    peer.client.close(); await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
    expect(peer.request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'guiResourceStream', action: 'close' }));
  } finally { peer.close(); }
});

it('releases a delayed registration when the session closes before stream creation', async () => {
  let registered!: (release: () => void) => void;
  const release = vi.fn();
  const peer = fixture(() => new Promise(resolve => { registered = resolve; }));
  const opening = expect(peer.client.open('resource', 'http://127.0.0.1:80')).rejects.toThrow('changed');
  peer.client.close(); registered(release);
  await opening;
  expect(release).toHaveBeenCalledTimes(1);
  expect(peer.request).not.toHaveBeenCalled(); peer.close();
});

it('cancels before socket open completes and closes the eventual socket without retaining a request slot', async () => {
  let connected!: (socket: MappingSocket) => void;
  const abort = new AbortController();
  const close = vi.fn();
  const opening = openMappingSocket({ openResource: vi.fn(), closeResource: vi.fn(), link: vi.fn(),
    stream: () => new Promise(resolve => { connected = resolve; }) }, 'resource', 'http://127.0.0.1', abort.signal);
  abort.abort(); await expect(opening).rejects.toThrow('cancelled');
  connected({ read: vi.fn(), write: vi.fn(), close }); await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
});
