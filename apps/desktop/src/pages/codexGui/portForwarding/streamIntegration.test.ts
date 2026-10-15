// @vitest-environment jsdom
import http from 'node:http';
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
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';
import { WebMappingTunnel } from '../../../../../web/src/chat/portMapping/httpTunnel';
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
  const incoming: ((bytes: Uint8Array) => void)[] = [];
  let direct = true, records = 0;
  const deliver = (side: number, path: 'direct' | 'relay', bytes: Uint8Array) => {
    records++;
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
      onMessage: callback => { incoming[side] = callback; } };
    transport.attach(channel); transport.setMode('direct'); transports.push(transport);
  }
  const links: MappingStreamLink[] = transports.map((bulk, side) => ({ bulk, createBulkCipher: identity =>
    new BulkCipher(new Uint8Array(32).fill(37), { ...identity, desktop: side === 1,
      sessionId: 'authenticated-test-session', desktopKey: 'host', clientKey: 'viewer' }) }));
  const host = new RemoteMappingStreams(links[1]);
  let control = 0;
  const streams = new MappingStreamClient({ link: () => links[0], random: randomBytes, supported: () => true,
    request: async <T>(body: object) => {
      control++; await wait(30);
      const result = await host.request(body as Record<string, unknown>);
      await wait(30); return result as T;
    } });
  const client: ForwardingClient = { openResource: async () => 'resource', closeResource: async () => {},
    link: (_resource, request) => sockets.request(request), stream: streams.open };
  return { origin, client, host, streams, counts: () => ({ control, records }),
    switchPath: () => { direct = false; transports.forEach(value => value.setMode('relay')); },
    close: async () => {
      streams.close(); host.close(); transports.forEach(value => value.close());
      timers.forEach(clearTimeout); await sockets.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    } };
}

it('loads a real 8 MiB HTTP response over encrypted streams, preserves bytes on switching, and reuses TCP', async () => {
  const body = randomBytes(8 * 1024 * 1024);
  let connections = 0;
  const server = http.createServer((_request, response) => response.end(body));
  server.on('connection', () => { connections++; });
  const service = await fixture(server);
  const tunnel = new WebMappingTunnel(service.client, { bridgeBudget: new StreamBudget(), localPort: 1, onClosed() {} });
  let ticks = 0;
  const heartbeat = setInterval(() => { ticks++; }, 20);
  try {
    await tunnel.resolve('resource', service.origin);
    const before = connections;
    const start = performance.now();
    const downloading = tunnel.request({ url: '/' });
    const switching = setTimeout(service.switchPath, 130);
    const response = await downloading;
    clearTimeout(switching);
    const elapsed = Math.round(performance.now() - start);
    expect(Buffer.from(response.body).equals(body)).toBe(true);
    expect(connections - before).toBe(1);
    expect(ticks).toBeGreaterThan(3);
    expect(service.counts().control).toBe(1);
    expect(elapsed).toBeLessThan(4000);
    expect(Buffer.from((await tunnel.request({ url: '/' })).body).equals(body)).toBe(true);
    expect(connections - before).toBe(1);
    process.stdout.write(JSON.stringify({ scenario: 'encrypted 8 MiB HTTP, 60 ms RTT, P2P to relay',
      milliseconds: elapsed, ...service.counts() }) + '\n');
  } finally { clearInterval(heartbeat); await tunnel.close(); await service.close(); }
}, 15_000);

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
