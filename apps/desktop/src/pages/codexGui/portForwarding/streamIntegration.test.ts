// @vitest-environment jsdom
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '../../../api/backend';
import { LinkSocketFixture } from '../terminal/linkTunnelSocketFixture';
import { RemoteMappingStreams } from '../../../remoteChat/mappingStreams';
import { BulkCipher } from '../../../../../../shared/remote-chat/bulkCipher';
import { BulkTransport, type BinaryChannel } from '../../../../../../shared/remote-chat/bulkTransport';
import { MappingStreamClient } from '../../../../../../shared/port-mapping/streamClient';
import type { MappingStreamLink } from '../../../../../../shared/port-mapping/streamMux';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';
import type { TerminalLinkRequest } from '../../../../../../shared/terminal/links';
import { bridgeSocket } from '../../../../../native/src/chat/portMapping/socketBridge';

vi.mock('../../../api/backend', () => ({ invoke: vi.fn() }));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
afterEach(() => vi.clearAllMocks());

async function fixture(server: net.Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const sockets = new LinkSocketFixture();
  vi.mocked(invoke).mockImplementation((_name, args) => sockets.request(
    (args as { request: TerminalLinkRequest }).request) as ReturnType<typeof invoke>);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const transports: BulkTransport[] = [];
  let direct = true;
  const deliver = (side: number, path: 'direct' | 'relay', bytes: Uint8Array) => {
    if (path === 'direct' && !direct) return;
    const timer = setTimeout(() => {
      timers.delete(timer); transports[1 - side].receive(bytes, path);
    }, 30);
    timers.add(timer);
  };
  for (let side = 0; side < 2; side++) {
    const transport = new BulkTransport({ available: () => true, send: async bytes => deliver(side, 'relay', bytes) });
    const channel: BinaryChannel = { readyState: 'open', bufferedAmount: 0,
      send: bytes => deliver(side, 'direct', bytes), close() {}, onLow: () => () => {}, onClose() {},
      onMessage() {} };
    transport.attach(channel); transport.setMode('direct'); transports.push(transport);
  }
  const links: MappingStreamLink[] = transports.map((bulk, side) => ({ bulk, createBulkCipher: identity =>
    new BulkCipher(new Uint8Array(32).fill(37), { ...identity, desktop: side === 1,
      sessionId: 'authenticated-test-session', desktopKey: 'host', clientKey: 'viewer' }) }));
  const host = new RemoteMappingStreams(links[1]);
  let failReceiver = () => {};
  const streams = new MappingStreamClient({ link: () => links[0], random: randomBytes, supported: () => true,
    register: async options => { failReceiver = options.failed; return () => {}; },
    request: async <T>(body: object) => {
      await wait(30);
      const result = 'request' in body
        ? await sockets.request(body.request as TerminalLinkRequest)
        : await host.request(body as Record<string, unknown>);
      await wait(30); return result as T;
    } });
  const client: ForwardingClient = { openResource: async () => 'resource', closeResource: async () => {},
    link: (_resource, request) => sockets.request(request), stream: streams.open };
  return { origin, client, host, streams, failReceiver: () => failReceiver(),
    switchPath: () => { direct = false; transports.forEach(value => value.setMode('relay')); },
    close: async () => {
      streams.close(); host.close(); transports.forEach(value => value.close());
      timers.forEach(clearTimeout); await sockets.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    } };
}

it('stops real TCP forwarding after receiver failure without silently downgrading', async () => {
  const service = await fixture(net.createServer(socket => socket.pipe(socket)));
  try {
    const first = await service.streams.open('resource', service.origin);
    await first.write(Buffer.from('before'));
    expect(Buffer.from((await first.read()).data).toString()).toBe('before');
    const pending = expect(first.read()).rejects.toThrow('closed');
    service.failReceiver(); await pending;
    await expect(service.streams.open('resource', service.origin)).rejects.toThrow('重新连接');
  } finally { await service.close(); }
});

it('carries simultaneous binary upload/download through the mobile TCP bridge and closes pending reads', async () => {
  const service = await fixture(net.createServer(socket => socket.pipe(socket)));
  const bridges: ReturnType<typeof bridgeSocket>[] = [];
  const listener = net.createServer(socket => bridges.push(bridgeSocket({
    socket: socket as unknown as Parameters<typeof bridgeSocket>[0]['socket'],
    client: service.client, resource: 'resource', url: service.origin,
  })));
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const browser = net.connect((listener.address() as net.AddressInfo).port, '127.0.0.1');
  const body = randomBytes(4 * 1024 * 1024);
  try {
    const received = new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = []; let size = 0;
      browser.on('error', reject).on('data', data => {
        parts.push(data); size += data.length; if (size === body.length) resolve(Buffer.concat(parts));
      });
    });
    browser.write(body);
    const switching = setTimeout(service.switchPath, 120);
    expect((await received).equals(body)).toBe(true);
    clearTimeout(switching);
    browser.destroy();
    await Promise.all(bridges.map(bridge => bridge.done));
  } finally {
    browser.destroy(); bridges.forEach(bridge => bridge.close());
    await new Promise<void>(resolve => listener.close(() => resolve())); await service.close();
  }
}, 15_000);
