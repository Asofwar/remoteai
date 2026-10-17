import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MappingStreamClient, type MappingStreamBridge } from '../../../../../../shared/port-mapping/streamClient';
import { BulkCipher } from '../../../../../../shared/remote-chat/bulkCipher';
import { BulkTransport } from '../../../../../../shared/remote-chat/bulkTransport';
import { STREAM_MANIFEST, type MappingStreamLink } from '../../../../../../shared/port-mapping/streamMux';
import { openMappingSocket, type MappingSocket } from '../../../../../../shared/port-mapping/socket';

function fixture(register?: MappingStreamBridge, supported = true) {
  const transport = new BulkTransport({ available: () => true, send: async () => {} });
  transport.setMode('relay');
  let link: MappingStreamLink = { bulk: transport, createBulkCipher: identity => new BulkCipher(new Uint8Array(32),
    { ...identity, sessionId: 'one', desktopKey: 'host', clientKey: 'client', desktop: false }) };
  const request = vi.fn(async (body: object) => 'request' in body ? { type: 'socket', id: 'legacy' } : {});
  const client = new MappingStreamClient({ link: () => link, random: randomBytes, supported: () => supported,
    request: async <T>(body: object) => await request(body) as T, register });
  return { client, request, transport, reconnect: () => { client.close(); link = { ...link }; },
    close: () => { client.close(); transport.close(); } };
}

it.each(['native', 'cipher'])('recovers from %s receiver failure without changing the live host epoch', async failure => {
  let fail!: () => void;
  const release = vi.fn();
  const register = vi.fn(async (options: Parameters<MappingStreamBridge>[0]) => {
    fail = options.failed; return release;
  });
  const peer = fixture(register);
  try {
    const first = await peer.client.open('resource', 'http://127.0.0.1:3002');
    const reading = expect(first.read()).rejects.toThrow('closed');
    if (failure === 'native') fail();
    else {
      const cipher = new BulkCipher(new Uint8Array(32).fill(9), { ...register.mock.calls[0][0].identity,
        manifestId: STREAM_MANIFEST, sessionId: 'one', desktopKey: 'host', clientKey: 'client', desktop: true });
      peer.transport.receive(cipher.encrypt({ requestId: '33333333-3333-4333-8333-333333333333', block: 0,
        offset: 0 }, Uint8Array.of(1)), 'relay');
      cipher.destroy();
    }
    await reading;
    const recovered = await Promise.all(Array.from({ length: 3 }, () =>
      peer.client.open('resource', 'http://127.0.0.1:3002')));
    expect(register).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(peer.request.mock.calls.filter(([body]) => 'request' in body)).toHaveLength(3);
    recovered.forEach(socket => socket.close());
    peer.client.close(); await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
  } finally { peer.close(); }
});

it('recovers a pending open if its receiver fails before any application bytes are sent', async () => {
  let fail!: () => void;
  const peer = fixture(async options => { fail = options.failed; return vi.fn<() => void>(); });
  peer.request.mockImplementationOnce(async () => { fail(); return {}; });
  try {
    const socket = await peer.client.open('resource', 'http://127.0.0.1:3002');
    expect(peer.request).toHaveBeenCalledWith({ operation: 'guiResourceLink', id: 'resource',
      request: { type: 'connect', url: 'http://127.0.0.1:3002' } });
    socket.close();
  } finally { peer.close(); }
});

it('falls back when native registration fails before a stream can open', async () => {
  const peer = fixture(async () => { throw new Error('Native receiver unavailable'); });
  try {
    const socket = await peer.client.open('resource', 'http://127.0.0.1:3002');
    expect(peer.request).toHaveBeenCalledWith({ operation: 'guiResourceLink', id: 'resource',
      request: { type: 'connect', url: 'http://127.0.0.1:3002' } });
    socket.close();
  } finally { peer.close(); }
});

it('only disables streams on the failed link and uses a fresh epoch after reconnecting', async () => {
  let fail!: () => void;
  const register = vi.fn(async (options: Parameters<MappingStreamBridge>[0]) => {
    fail = options.failed; return vi.fn<() => void>();
  });
  const peer = fixture(register);
  try {
    const first = await peer.client.open('resource', 'http://127.0.0.1:3002');
    fail(); first.close();
    (await peer.client.open('resource', 'http://127.0.0.1:3002')).close();
    peer.reconnect();
    (await peer.client.open('new-resource', 'http://127.0.0.1:3002')).close();
    expect(register).toHaveBeenCalledTimes(2);
    expect(register.mock.calls[0][0].identity).not.toEqual(register.mock.calls[1][0].identity);
    expect(peer.request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'guiResourceStream',
      action: 'open', resource: 'new-resource' }));
  } finally { peer.close(); }
});

it('does not retry an authorization or target error over RPC', async () => {
  const peer = fixture();
  peer.request.mockRejectedValueOnce(new Error('Resource access denied'));
  try {
    await expect(peer.client.open('resource', 'http://127.0.0.1:3002')).rejects.toThrow('Resource access denied');
    expect(peer.request.mock.calls.some(([body]) => 'request' in body)).toBe(false);
  } finally { peer.close(); }
});

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
