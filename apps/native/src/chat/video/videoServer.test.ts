import { createConnection } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoServer, type VideoServer } from './videoServer';
vi.mock('react-native-tcp-socket', async () => ({ default: await import('node:net') }));
const running: VideoServer[] = [];
afterEach(() => { for (const server of running.splice(0)) server.close(); });
const info = { id: '12345678-1234-4234-a234-123456789012', size: 100,
  mimeType: 'video/mp4' as const };
async function setup() {
  const data = Buffer.from(Array.from({ length: info.size }, (_, index) => index));
  const read = vi.fn(async (offset: number, length: number) =>
    ({ offset, data: data.subarray(offset, offset + length).toString('base64') }));
  const error = vi.fn();
  const server = await createVideoServer({ info, read }, error);
  running.push(server);
  return { server, read, error };
}
function request(url: string, headers: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const socket = createConnection(Number(new URL(url).port), '127.0.0.1');
    const parts: Buffer[] = [];
    socket.on('data', (data) => parts.push(typeof data === 'string' ? Buffer.from(data) : data));
    socket.on('error', reject);
    socket.on('close', () => resolve(Buffer.concat(parts)));
    socket.on('connect', () => socket.write(headers + '\r\n\r\n'));
  });
}
it('serves HTTP byte ranges and HEAD without reading the whole video', async () => {
  const { server, read, error } = await setup();
  const response = await request(server.url, 'GET /' + info.id + ' HTTP/1.1\r\nRange: bytes=70-79');
  const boundary = response.indexOf('\r\n\r\n');
  expect(response.subarray(0, boundary).toString()).toContain('206 Partial Content');
  expect(response.subarray(boundary + 4)).toEqual(Buffer.from([70, 71, 72, 73, 74, 75, 76, 77, 78, 79]));
  expect(read).toHaveBeenCalledExactlyOnceWith(70, 10);
  read.mockClear();
  const head = await request(server.url, 'HEAD /' + info.id + ' HTTP/1.1');
  expect(head.toString()).toContain('Content-Length: 100');
  expect(read).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
it('rejects foreign capabilities and unsatisfiable ranges before requesting remote data', async () => {
  const { server, read } = await setup();
  expect((await request(server.url, 'GET /wrong HTTP/1.1')).toString()).toContain('404');
  expect((await request(server.url, 'GET /' + info.id + ' HTTP/1.1\r\nRange: bytes=999-')).toString())
    .toContain('416');
  expect(read).not.toHaveBeenCalled();
});
