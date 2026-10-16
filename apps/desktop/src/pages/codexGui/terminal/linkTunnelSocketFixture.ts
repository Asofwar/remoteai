import net from 'node:net';
import type { TerminalLinkReply, TerminalLinkRequest } from '../../../../../../shared/terminal/links';
import { LINK_CHUNK_BYTES } from '../../../../../../shared/terminal/linkChunks';

type Request = TerminalLinkRequest | { type: 'listen'; port?: number }
  | { type: 'accept'; scope: string } | { type: 'stop'; scope: string };
interface SocketState { socket: net.Socket; chunks: Buffer[]; ended: boolean; wake?: () => void }

/** Real loopback sockets behind the same byte-oriented interface as the native commands. */
export class LinkSocketFixture {
  constructor(private readonly chunkBytes = LINK_CHUNK_BYTES) {}
  private sequence = 0;
  private listener?: net.Server;
  private readonly sockets = new Map<string, SocketState>();
  private readonly accepted: string[] = [];
  private accept?: (reply: TerminalLinkReply) => void;

  request = async (request: Request): Promise<TerminalLinkReply> => {
    if (request.type === 'listen') return this.listen(request.port);
    if (request.type === 'stop') { await this.close(); return { type: 'done' }; }
    if (request.type === 'accept') {
      const id = this.accepted.shift();
      return id ? { type: 'socket', id } : new Promise(resolve => { this.accept = resolve; });
    }
    if (request.type === 'connect') {
      const socket = net.connect(Number(new URL(request.url).port), '127.0.0.1');
      const id = this.register(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve); socket.once('error', reject);
      });
      return { type: 'socket', id };
    }
    if (!('id' in request)) throw new Error('Unsupported fixture request');
    const state = this.sockets.get(request.id)!;
    if (request.type === 'close') { state?.socket.destroy(); return { type: 'done' }; }
    if (request.type === 'write') {
      if (Buffer.byteLength(request.data, 'base64') > LINK_CHUNK_BYTES) {
        throw new Error('Write too large');
      }
      await new Promise<void>((resolve, reject) => state.socket.write(Buffer.from(request.data, 'base64'),
        error => error ? reject(error) : resolve()));
      return { type: 'done' };
    }
    if (!state.chunks.length && !state.ended) await new Promise<void>(resolve => { state.wake = resolve; });
    const bytes = Buffer.concat(state.chunks.splice(0));
    const limit = this.chunkBytes;
    if (bytes.length > limit) state.chunks.push(bytes.subarray(limit));
    return { type: 'data', data: bytes.subarray(0, limit).toString('base64'),
      eof: state.ended && !state.chunks.length };
  };

  async close() {
    this.accept?.({ type: 'done' }); this.accept = undefined;
    for (const state of this.sockets.values()) state.socket.destroy();
    await new Promise<void>(resolve => this.listener ? this.listener.close(() => resolve()) : resolve());
    this.listener = undefined;
  }

  private register(socket: net.Socket) {
    socket.setNoDelay(true);
    const id = String(++this.sequence);
    const state: SocketState = { socket, chunks: [], ended: false };
    socket.on('data', data => { state.chunks.push(data); state.wake?.(); state.wake = undefined; });
    socket.on('close', () => { state.ended = true; state.wake?.(); state.wake = undefined; });
    socket.on('error', () => socket.destroy());
    this.sockets.set(id, state);
    return id;
  }

  private async listen(port = 0): Promise<TerminalLinkReply> {
    const server = net.createServer(socket => {
      const id = this.register(socket);
      if (this.accept) { this.accept({ type: 'socket', id }); this.accept = undefined; }
      else this.accepted.push(id);
    });
    this.listener = server;
    await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
    return { type: 'listener', id: 'listener', port: (server.address() as net.AddressInfo).port };
  }
}
