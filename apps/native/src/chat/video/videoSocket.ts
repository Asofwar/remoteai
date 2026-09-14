import type TcpSocket from 'react-native-tcp-socket';
type Socket = InstanceType<typeof TcpSocket.Socket>;
import type { Buffer } from 'buffer';
import { videoHeaders, videoRange, videoRequest } from './videoHttp';
import { videoRangeStream, type RangeSource } from './videoRangeStream';

const MAX_HEADER_BYTES = 8192;
const SOCKET_TIMEOUT_MS = 30_000;

function write(socket: Socket, data: string | Buffer) {
  return new Promise<void>((resolve, reject) => {
    const closed = () => finish(new Error('Video connection closed'));
    const finish = (error?: Error | null) => {
      socket.off('close', closed);
      if (error) reject(error); else resolve();
    };
    if (socket.destroyed) { reject(new Error('Video connection closed')); return; }
    socket.once('close', closed);
    socket.write(data, undefined, finish);
  });
}

async function respond(socket: Socket, header: string, source: RangeSource, signal: AbortSignal) {
  const request = videoRequest(header, source.info.id);
  const range = request && videoRange(request.range, source.info.size);
  if (!request || !range) {
    const status = request ? '416 Range Not Satisfiable' : '404 Not Found';
    socket.end('HTTP/1.1 ' + status + '\r\nContent-Length: 0\r\nConnection: close\r\n'
      + (request ? 'Content-Range: bytes */' + source.info.size + '\r\n' : '') + '\r\n');
    return;
  }
  await write(socket, videoHeaders(source.info, range));
  if (!request.head) {
    for await (const bytes of videoRangeStream(source, range, signal)) await write(socket, bytes);
  }
  if (!socket.destroyed) socket.end();
}

export function serveVideoSocket(socket: Socket, source: RangeSource, onError: (error: unknown) => void) {
  const abort = new AbortController();
  let header = '';
  let responding = false;
  socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy());
  socket.on('close', () => abort.abort());
  // Player cancellation and seeks routinely reset their old HTTP connection.
  socket.on('error', () => { abort.abort(); socket.destroy(); });
  socket.on('data', (data) => {
    if (responding || abort.signal.aborted) return;
    header += data.toString();
    if (header.length > MAX_HEADER_BYTES) { socket.destroy(); return; }
    const end = header.indexOf('\r\n\r\n');
    if (end < 0) return;
    responding = true;
    void respond(socket, header.slice(0, end), source, abort.signal).catch((error: unknown) => {
      if (!abort.signal.aborted) onError(error);
      socket.destroy();
    });
  });
}
