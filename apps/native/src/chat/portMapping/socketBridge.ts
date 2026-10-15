import { openMappingSocket, type MappingSocket } from '../../../../../shared/port-mapping/socket';
import { Buffer } from 'buffer';
import type TcpSocket from 'react-native-tcp-socket';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';

type Socket = InstanceType<typeof TcpSocket.Socket>;
const MAX_QUEUED_BYTES = 1024 * 1024;

/** Preserve binary bytes and serialize writes; a slow peer must not accumulate unbounded data. */
export function bridgeSocket(options: {
  socket: Socket; client: ForwardingClient; resource: string; url: string;
}): { close: () => void; done: Promise<void> } {
  const { socket, client, resource, url } = options;
  let remote: MappingSocket | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    remote?.close();
  };
  const opened = openMappingSocket(client, resource, url).then(stream => {
    remote = stream;
    if (closed) remote.close();
    return remote;
  });
  socket.on('error', close);
  socket.once('close', close);
  forwardLocalData({ socket, opened, isClosed: () => closed, close });
  const done = opened.then(async stream => {
    while (!closed) {
      const reply = await stream.read();
      if (closed) break;
      if (reply.data.length) await writeSocket(socket, Buffer.from(reply.data));
      if (reply.eof) break;
    }
  }).catch(reason => {
    if (!closed) console.warn('Port mapping read failed',
      reason instanceof Error ? reason.message : 'Remote request failed');
  }).finally(close);
  return { close, done };
}

function forwardLocalData({ socket, opened, isClosed, close }: {
  socket: Socket; opened: Promise<MappingSocket>;
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
      const stream = await opened;
      if (!isClosed()) await stream.write(bytes);
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
