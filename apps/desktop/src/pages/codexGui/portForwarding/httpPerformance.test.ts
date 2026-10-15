// @vitest-environment jsdom
import http from 'node:http';
import type net from 'node:net';
import { gzipSync } from 'node:zlib';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { WebMappingTunnel } from '../../../../../web/src/chat/portMapping/httpTunnel';
import { previewDocument } from '../../../../../web/src/chat/portMapping/previewDocument';
import { LinkSocketFixture } from '../terminal/linkTunnelSocketFixture';
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';
import { HttpResponseReader } from '../../../../../../shared/port-mapping/http';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
afterEach(() => vi.unstubAllGlobals());

async function fixture(handler: http.RequestListener, latency = 0) {
  vi.stubGlobal('Blob', NodeBlob);
  const peer = new LinkSocketFixture();
  const server = http.createServer(handler);
  const connects: string[] = [];
  const tunnel = new WebMappingTunnel({ openResource: async () => 'resource', closeResource: async () => {},
    link: async (_scope, request) => {
      if (request.type === 'connect') connects.push(request.url);
      if (latency) await wait(latency / 2);
      const reply = await peer.request(request);
      if (latency) await wait(latency / 2);
      return reply;
    } }, { bridgeBudget: new StreamBudget(), localPort: 1, onClosed() {} });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  await tunnel.resolve('resource', origin);
  connects.length = 0;
  return { tunnel, origin, connects, server, close: async () => {
    await tunnel.close(); await wait(latency + 5); await peer.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}

it('loads twenty small resources in parallel and reuses connections at 60 ms RPC RTT', async () => {
  const service = await fixture((request, response) => {
    if (request.url === '/') response.end('<body>' + Array.from({ length: 20 }, (_, index) =>
      `<img src="/image-${index}.svg">`).join('') + '</body>');
    else { response.setHeader('Content-Type', 'image/svg+xml'); response.end('<svg/>'); }
  }, 60);
  try {
    const started = performance.now();
    const document = await previewDocument(service.tunnel, { url: service.origin + '/' });
    const milliseconds = Math.round(performance.now() - started);
    expect(document.html.match(/data:image/g)).toHaveLength(20);
    expect(service.connects.length).toBeLessThanOrEqual(8);
    expect(milliseconds).toBeLessThan(1600);
    process.stdout.write(JSON.stringify({ scenario: 'HTML + 20 tiny assets, 60 ms RPC RTT',
      milliseconds, connections: service.connects.length }) + '\n');
  } finally { await service.close(); }
}, 10_000);

it('negotiates gzip, decodes bytes and reuses a healthy HTTP connection', async () => {
  const body = Buffer.from('const message = "远程网页";\n'.repeat(5000));
  const compressed = gzipSync(body);
  const service = await fixture((request, response) => {
    expect(request.headers['accept-encoding']).toContain('gzip');
    response.setHeader('Content-Encoding', 'gzip');
    response.end(compressed);
  });
  try {
    for (let index = 0; index < 3; index++) {
      const reply = await service.tunnel.request({ url: '/script.js' });
      expect(Buffer.from(reply.body).equals(body)).toBe(true);
      expect(new Headers(reply.headers).has('content-encoding')).toBe(false);
    }
    expect(service.connects).toHaveLength(1);
    expect(compressed.length).toBeLessThan(body.length / 20);
  } finally { await service.close(); }
});

it('reopens a closed idle connection for GET but never replays a POST', async () => {
  const requests: string[] = [];
  const service = await fixture((request, response) => { requests.push(request.method!); response.end('ok'); });
  const retire = async () => { service.server.closeIdleConnections(); await wait(20); };
  try {
    await service.tunnel.request({ url: '/' });
    await retire();
    expect((await service.tunnel.request({ url: '/' })).status).toBe(200);
    expect(service.connects).toHaveLength(2);
    await retire();
    await expect(service.tunnel.request({ url: '/', method: 'POST' })).rejects.toThrow();
    expect(requests).toEqual(['GET', 'GET']);
    expect(service.connects).toHaveLength(2);
  } finally { await service.close(); }
});

it('consumes complete chunk trailers before allowing connection reuse', () => {
  const reader = new HttpResponseReader();
  const bytes = (text: string) => new TextEncoder().encode(text);
  expect(reader.push(bytes('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n0\r\n'), false))
    .toBeUndefined();
  expect(reader.reusable).toBe(false);
  expect([...reader.push(bytes('X-Checksum: value\r\n\r\n'), false)!.body]).toEqual([120]);
  expect(reader.reusable).toBe(true);
  expect(() => new HttpResponseReader().push(bytes(
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 1\r\n\r\n'), false)).toThrow('Ambiguous');
});

it('cancels active and queued requests when a preview is closed and frees slots for the next page', async () => {
  let stalled = 0;
  const service = await fixture((request, response) => {
    if (request.url === '/stall') { stalled++; return; }
    response.end('next page');
  });
  const cancelled = new AbortController();
  try {
    const pending = Array.from({ length: 12 }, () => service.tunnel.request({ url: '/stall' }, cancelled.signal)
      .then(() => false, () => true));
    await vi.waitFor(() => expect(stalled).toBe(8));
    cancelled.abort();
    expect(await Promise.all(pending)).toEqual(Array(12).fill(true));
    expect(new TextDecoder().decode((await service.tunnel.request({ url: '/' })).body)).toBe('next page');
  } finally { await service.close(); }
});
