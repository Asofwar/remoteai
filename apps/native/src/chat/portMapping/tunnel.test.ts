import net from 'node:net';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeMappingTunnel } from './tunnel';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';
import type { TerminalLinkReply } from '../../../../../shared/terminal/links';
import { StreamBudget } from '../../../../../shared/port-mapping/streamBudget';

vi.mock('react-native-tcp-socket', () => ({ default: net }));
vi.mock('buffer', async () => {
  const { createRequire } = await import('node:module');
  // Exercise the same Buffer polyfill that Metro ships, not Node's different subarray semantics.
  return createRequire(import.meta.url)('buffer/') as typeof import('buffer');
});
const background = vi.hoisted(() => ({ release: vi.fn(async () => undefined) }));
vi.mock('../backgroundConnection', () => ({ retainPortMappingConnection: async () => background.release }));
const listeners: net.Server[] = [];
const tunnels: NativeMappingTunnel[] = [];
const remoteSockets = new Map<string, net.Socket>();
const buffers = new Map<string, Buffer[]>();
const reads = new Map<string, () => void>();
let sequence = 0;

async function listen(server: net.Server) {
  listeners.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}
async function unusedPort() {
  const server = net.createServer(); const port = await listen(server);
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
const client: ForwardingClient = {
  openResource: async () => 'resource', closeResource: async () => undefined,
  link: async (_resource, request): Promise<TerminalLinkReply> => {
    if (request.type === 'connect') {
      const socket = net.connect(Number(new URL(request.url).port), '127.0.0.1');
      const id = String(++sequence); remoteSockets.set(id, socket); buffers.set(id, []);
      socket.on('data', data => { buffers.get(id)!.push(Buffer.from(data)); reads.get(id)?.(); });
      socket.on('close', () => reads.get(id)?.());
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
      return { type: 'socket', id };
    }
    const socket = remoteSockets.get(request.id)!;
    if (request.type === 'close') { socket?.destroy(); return { type: 'done' }; }
    if (request.type === 'write') {
      await new Promise<void>((resolve, reject) => socket.write(Buffer.from(request.data, 'base64'),
        error => error ? reject(error) : resolve()));
      return { type: 'done' };
    }
    if (!buffers.get(request.id)?.length && !socket.destroyed) {
      await new Promise<void>(resolve => reads.set(request.id, resolve)); reads.delete(request.id);
    }
    return { type: 'data', data: Buffer.concat(buffers.get(request.id)!.splice(0)).toString('base64'),
      eof: socket.destroyed };
  },
};
function tunnel(port: number, budget = new StreamBudget()) {
  const instance = new NativeMappingTunnel(client, { localPort: port, bridgeBudget: budget, onClosed: vi.fn() });
  tunnels.push(instance); return instance;
}
afterEach(async () => {
  await Promise.all(tunnels.splice(0).map(value => value.close()));
  for (const socket of remoteSockets.values()) socket.destroy();
  await Promise.all(listeners.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  remoteSockets.clear(); buffers.clear(); reads.clear();
});

it('forwards real HTTP bytes, releases its background lease, and reuses the same port after stop', async () => {
  const remote = await listen(http.createServer((_request, response) => response.end('mobile mapping')));
  const local = await unusedPort(); const first = tunnel(local);
  await first.resolve('resource', `http://127.0.0.1:${remote}`);
  expect(await (await fetch(`http://127.0.0.1:${local}`)).text()).toBe('mobile mapping');
  await first.close(); expect(background.release).toHaveBeenCalled();
  const second = tunnel(local); await second.resolve('resource', `http://127.0.0.1:${remote}`);
  expect(await (await fetch(`http://127.0.0.1:${local}`)).text()).toBe('mobile mapping');
});

it('rejects an occupied local port without disturbing the existing service', async () => {
  const remote = await listen(net.createServer(socket => socket.end()));
  const occupied = await listen(http.createServer((_request, response) => response.end('existing')));
  await expect(tunnel(occupied).resolve('resource', `http://127.0.0.1:${remote}`)).rejects.toThrow('已被占用');
  expect(await (await fetch(`http://127.0.0.1:${occupied}`)).text()).toBe('existing');
});

it('preserves binary bytes and buffers queued connections until the shared budget is available', async () => {
  const remote = await listen(net.createServer(socket => socket.pipe(socket)));
  const local = await unusedPort(); const budget = new StreamBudget(1);
  await tunnel(local, budget).resolve('resource', `http://127.0.0.1:${remote}`);
  const input = Buffer.alloc(150_000); for (let index = 0; index < input.length; index++) input[index] = index % 256;
  const socket = net.connect(local, '127.0.0.1');
  await new Promise<void>(resolve => socket.once('connect', resolve));
  const received = new Promise<Buffer>(resolve => {
    const parts: Buffer[] = []; let size = 0;
    socket.on('data', data => {
      const bytes = Buffer.from(data); parts.push(bytes); size += bytes.length;
      if (size === input.length) resolve(Buffer.concat(parts));
    });
  });
  socket.write(input); expect(await received).toEqual(input);
  const excess = net.connect(local, '127.0.0.1');
  const reply = new Promise<Buffer>(resolve => excess.once('data', resolve));
  await new Promise<void>(resolve => excess.once('connect', resolve));
  excess.write('queued request');
  expect(excess.destroyed).toBe(false);
  expect(budget.active).toBe(1); socket.destroy();
  expect(await reply).toEqual(Buffer.from('queued request'));
  excess.destroy();
});

it('stops queued sockets immediately and reuses their local port without leaking a reservation', async () => {
  const remote = await listen(http.createServer((_request, response) => response.end('restarted')));
  const port = await unusedPort(); const budget = new StreamBudget(1);
  const reserved = await budget.acquire(new AbortController().signal);
  const first = tunnel(port, budget);
  await first.resolve('resource', `http://127.0.0.1:${remote}`);
  const waiting = net.connect(port, '127.0.0.1');
  const closed = new Promise<void>(resolve => waiting.once('close', () => resolve()));
  await new Promise<void>(resolve => waiting.once('connect', resolve));
  await first.close(); await closed;
  expect(budget.active).toBe(1); reserved!();
  const second = tunnel(port, budget);
  await second.resolve('resource', `http://127.0.0.1:${remote}`);
  expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('restarted');
});
