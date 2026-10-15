import http from 'node:http';
import net from 'node:net';
import { expect, it } from 'vitest';
import { WebMappingTunnel } from '../../../../../web/src/chat/portMapping/httpTunnel';
import { LinkSocketFixture } from '../terminal/linkTunnelSocketFixture';
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';
import { LINK_CHUNK_BYTES } from '../../../../../../shared/terminal/linkChunks';

it('preserves a binary HTTP body across larger upload and download chunks in the Web viewer', async () => {
  const peer = new LinkSocketFixture();
  const writes: number[] = [];
  const tunnel = new WebMappingTunnel({ openResource: async () => 'resource', closeResource: async () => {},
    link: async (_scope, request) => {
      if (request.type === 'write') writes.push(Buffer.byteLength(request.data, 'base64'));
      return peer.request(request);
    } }, { bridgeBudget: new StreamBudget(), localPort: 3002, onClosed() {} });
  const server = http.createServer((request, response) => {
    const bytes: Buffer[] = [];
    request.on('data', part => bytes.push(part));
    request.on('end', () => response.end(Buffer.concat(bytes)));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    await tunnel.resolve('resource', `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`);
    const body = Uint8Array.from({ length: LINK_CHUNK_BYTES * 2 + 1 }, (_, index) => index % 251);
    const reply = await tunnel.request({ url: '/echo', method: 'POST', body });
    expect(reply.status).toBe(200);
    expect(Buffer.from(reply.body).equals(Buffer.from(body))).toBe(true);
    expect(writes).toHaveLength(3);
    expect(writes.slice(0, 2)).toEqual([LINK_CHUNK_BYTES, LINK_CHUNK_BYTES]);
    expect(writes[2]).toBeLessThan(LINK_CHUNK_BYTES);
  } finally {
    await tunnel.close(); await peer.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
