import { Buffer } from 'buffer';
import type TcpSocket from 'react-native-tcp-socket';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';

type Socket = InstanceType<typeof TcpSocket.Socket>;
const CHUNK_BYTES = 48 * 1024;
const MAX_QUEUED_BYTES = 1024 * 1024;

/** Preserve binary bytes and serialize writes; a slow peer must not accumulate unbounded data. */
export function bridgeSocket(options: {
  socket: Socket; client: ForwardingClient; resource: string; url: string;
}): { close: () => void; done: Promise<void> } {
  const { socket, client, resource, url } = options;
  let remote: string | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    if (remote) void client.link(resource, { type: 'close', id: remote }).catch(() => {
      // Disconnect cleanup also closes the owning resource.
    });
  };
  const opened = client.link(resource, { type: 'connect', url }).then(async reply => {
    if (reply.type !== 'socket') throw new Error('Unexpected socket response');
    remote = reply.id;
    if (closed) await client.link(resource, { type: 'close', id: remote });
    return remote;
  });
  socket.on('error', close);
  socket.once('close', close);
  forwardLocalData({ socket, client, resource, opened, isClosed: () => closed, close });
  const done = opened.then(async id => {
    while (!closed) {
      const reply = await client.link(resource, { type: 'read', id });
      if (reply.type !== 'data') throw new Error('Unexpected read response');
      if (closed) break;
      if (reply.data) await writeSocket(socket, Buffer.from(reply.data, 'base64'));
      if (reply.eof) break;
    }
  }).catch(reason => {
    if (!closed) console.warn('Port mapping read failed',
      reason instanceof Error ? reason.message : 'Remote request failed');
  }).finally(close);
  return { close, done };
}

function forwardLocalData({ socket, client, resource, opened, isClosed, close }: {
  socket: Socket; client: ForwardingClient; resource: string; opened: Promise<string>;
  isClosed: () => boolean; close: () => void;
}) {
  let queued = 0;
  let writes = Promise.resolve();
  socket.on('data', data => {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    queued += bytes.length;
    if (queued > MAX_QUEUED_BYTES) { close(); return; }
    socket.pause();
    writes = writes.then(async () => {
      const id = await opened;
      for (let offset = 0; offset < bytes.length && !isClosed(); offset += CHUNK_BYTES) {
        await client.link(resource, { type: 'write', id,
          // React Native's Buffer.subarray returns Uint8Array, whose toString does not encode base64.
          data: Buffer.from(bytes.subarray(offset, offset + CHUNK_BYTES)).toString('base64') });
      }
      queued -= bytes.length;
      if (!isClosed() && queued === 0) socket.resume();
    }).catch(reason => {
      console.warn('Port mapping write failed', reason instanceof Error ? reason.message : 'Remote request failed');
      close();
    });
  });
}

function writeSocket(socket: Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const closed = () => finish(new Error('Socket closed'));
    const finish = (error?: Error | null) => {
      socket.off('close', closed);
      if (error) reject(error); else resolve();
    };
    if (socket.destroyed) { closed(); return; }
    socket.once('close', closed);
    socket.write(data, undefined, finish);
  });
}
