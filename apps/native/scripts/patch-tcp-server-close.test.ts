import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { patchServerClose } = require('./patch-tcp-server-close.cjs') as { patchServerClose: (source: string) => string };
const source = readFileSync(join(dirname(require.resolve('react-native-tcp-socket/package.json')), 'src/Server.js'), 'utf8');

function fixture() {
  const native = new EventEmitter();
  const emitter = { addListener: (event: string, handler: (...args: unknown[]) => void) => {
    native.on(event, handler); return { remove: () => native.off(event, handler) };
  } };
  const close = vi.fn();
  const code = patchServerClose(source).replace(/^import .*;$/gm, '')
    .replace('const Sockets = NativeModules.TcpSockets;', '').replace('export default class Server', 'return class Server');
  const Server = new Function('EventEmitter', 'nativeEventEmitter', 'getNextId', 'Sockets', code)(
    EventEmitter, emitter, () => 7, { listen: vi.fn(), close },
  ) as new () => EventEmitter & {
    listen: (options: object) => void; close: (callback: () => void) => void; _addConnection: (socket: EventEmitter) => void;
  };
  const server = new Server(); server.listen({ host: '127.0.0.1', port: 13000 });
  native.emit('listening', { id: 7, connection: { localAddress: '127.0.0.1', localPort: 13000 } });
  return { server, native, close };
}
it('does not report a stopped listener until the native close acknowledgement arrives', () => {
  const { server, native, close } = fixture(); const stopped = vi.fn();
  server.close(stopped); expect(close).toHaveBeenCalledWith(7); expect(stopped).not.toHaveBeenCalled();
  native.emit('close', { id: 99 }); expect(stopped).not.toHaveBeenCalled();
  native.emit('close', { id: 7 }); expect(stopped).toHaveBeenCalledTimes(1);
  expect(native.eventNames()).toEqual([]);
});
it('waits for accepted sockets as well as the native listener acknowledgement', () => {
  const { server, native } = fixture(); const socket = new EventEmitter(); const stopped = vi.fn();
  server._addConnection(socket); server.close(stopped);
  socket.emit('close'); expect(stopped).not.toHaveBeenCalled();
  native.emit('close', { id: 7 }); expect(stopped).toHaveBeenCalledTimes(1);
});
it('is idempotent and rejects upstream changes', () => {
  const patched = patchServerClose(source); expect(patchServerClose(patched)).toBe(patched);
  expect(() => patchServerClose('changed')).toThrow('source changed');
});
