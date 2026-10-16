import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { MappingWebSocket, type MappingSocketEvent } from '../../../../../../shared/port-mapping/websocket';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';

function fixture() {
  let accept = '';
  let handshake = true;
  let writes = 0;
  let read: ((value: Awaited<ReturnType<ForwardingClient['link']>>) => void) | undefined;
  const link = vi.fn<ForwardingClient['link']>(async (_resource, request) => {
    if (request.type === 'connect') return { type: 'socket', id: 'socket' };
    if (request.type === 'close') return { type: 'done' };
    if (request.type === 'write') {
      writes++;
      if (writes > 1) throw new Error('Write failed after partial delivery');
      const key = /Sec-WebSocket-Key: (.+)\r/.exec(Buffer.from(request.data, 'base64').toString())![1];
      accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      return { type: 'done' };
    }
    if (handshake) {
      handshake = false;
      const headers = `HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`;
      return { type: 'data', data: Buffer.from(headers).toString('base64'), eof: false };
    }
    return new Promise(resolve => { read = resolve; });
  });
  const client = { link, openResource: vi.fn(), closeResource: vi.fn() } satisfies ForwardingClient;
  return { client, finishRead: () => read?.({ type: 'data', data: '', eof: true }) };
}

it('ends a socket exactly once after a write failure while the reader stays open, without replay', async () => {
  const { client, finishRead } = fixture();
  const events: MappingSocketEvent[] = [];
  const socket = new MappingWebSocket({ client, resource: 'resource', origin: 'http://localhost:8080',
    emit: event => events.push(event) });
  const running = socket.run('ws://localhost:8080/', []);
  await vi.waitFor(() => expect(events).toEqual([{ type: 'open', protocol: '' }]));
  await expect(Promise.all([socket.send('first'), socket.send('queued')])).rejects.toThrow('Write failed');
  await running;
  await expect(socket.send('later')).rejects.toThrow('Socket closed');
  expect(events.map(event => event.type)).toEqual(['open', 'error', 'close']);
  expect(events.at(-1)).toEqual({ type: 'close', code: 1006, wasClean: false });
  expect(client.link.mock.calls.filter(([, request]) => request.type === 'write')).toHaveLength(2);
  expect(client.link.mock.calls.filter(([, request]) => request.type === 'close')).toHaveLength(1);
  finishRead();
});
