import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { DesktopMappingTunnel } from './streamTunnel';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';
import type { MappingSocket } from '../../../../../../shared/port-mapping/socket';
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => vi.clearAllMocks());

function fixture(idlePolls = 0) {
  const download = deferred<{ data: Uint8Array; eof: boolean }>();
  const accepted = deferred<{ type: string; id: string }>();
  let read = 0, accept = 0;
  const remote: MappingSocket = { read: vi.fn(() => download.promise), write: vi.fn(async () => {}),
    close: vi.fn(), end: vi.fn(async () => {}) };
  const client: ForwardingClient = { openResource: vi.fn(), closeResource: vi.fn(), link: vi.fn(),
    stream: vi.fn().mockResolvedValueOnce({ close: vi.fn() }).mockResolvedValue(remote) };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const request = (args as { request?: { type: string } }).request;
    if (command === 'port_mapping_read') {
      read++;
      return new Uint8Array(read === 1 ? [0, 0, 255, 13, 10] : [1]).buffer;
    }
    if (request?.type === 'listen') return { type: 'listener', id: 'listener', port: 3002 };
    if (request?.type === 'accept') {
      if (idlePolls-- > 0) return { type: 'done' };
      if (++accept === 1) return accepted.promise;
      return new Promise(() => {});
    }
    if (request?.type === 'attach') return { type: 'socket', id: 7 };
    return { type: 'done' };
  });
  const tunnel = new DesktopMappingTunnel(client,
    { localPort: 3002, bridgeBudget: new StreamBudget(), onClosed: vi.fn() });
  return { tunnel, client, remote, download, accepted };
}

it('transfers binary uploads without RPC data and keeps downloads alive after local half close', async () => {
  const f = fixture();
  await f.tunnel.resolve('resource', 'http://127.0.0.1:3002');
  f.accepted.resolve({ type: 'socket', id: 'accepted' }); await flush();
  expect(f.client.stream).toHaveBeenLastCalledWith('resource', 'http://127.0.0.1:3002',
    expect.objectContaining({ nativeSocketId: 7 }));
  expect(f.remote.write).toHaveBeenCalledWith(Uint8Array.of(0, 255, 13, 10));
  expect(f.remote.end).toHaveBeenCalledOnce();
  expect(f.remote.close).not.toHaveBeenCalled();
  expect(f.client.link).not.toHaveBeenCalled();
  f.download.resolve({ data: new Uint8Array(), eof: true }); await flush();
  expect(f.remote.close).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('port_mapping_socket', { request: { type: 'close', id: 7 } });
  await f.tunnel.close();
});

it('cancels accepted and active sockets before the listener is released', async () => {
  const f = fixture();
  await f.tunnel.resolve('resource', 'http://127.0.0.1:3002');
  f.accepted.resolve({ type: 'socket', id: 'accepted' }); await flush();
  await f.tunnel.close();
  expect(f.remote.close).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link',
    { request: { type: 'stop', scope: 'listener' } });
});

it('requires stream support before opening a listener and never falls back to RPC', async () => {
  const f = fixture(); delete f.client.stream;
  await expect(f.tunnel.resolve('resource', 'http://127.0.0.1:3002')).rejects.toThrow('更新');
  expect(invoke).not.toHaveBeenCalled(); expect(f.client.link).not.toHaveBeenCalled();
  await f.tunnel.close();
});

it('keeps accepting connections after idle listener polls', async () => {
  const f = fixture(2);
  await f.tunnel.resolve('resource', 'http://127.0.0.1:3002');
  f.accepted.resolve({ type: 'socket', id: 'accepted' }); await flush();
  expect(f.remote.write).toHaveBeenCalledWith(Uint8Array.of(0, 255, 13, 10));
  await f.tunnel.close();
});

it('closes a socket whose native attachment completes after stopping', async () => {
  const f = fixture();
  const attached = deferred<{ type: string; id: number }>();
  const invokeOriginal = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((command, args, options) => {
    if (command === 'port_mapping_socket'
      && (args as { request: { type: string } }).request.type === 'attach') {
      return attached.promise as ReturnType<typeof invoke>;
    }
    return invokeOriginal(command, args, options);
  });
  await f.tunnel.resolve('resource', 'http://127.0.0.1:3002');
  f.accepted.resolve({ type: 'socket', id: 'accepted' }); await flush();
  await f.tunnel.close();
  attached.resolve({ type: 'socket', id: 7 }); await flush();
  expect(f.client.stream).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('port_mapping_socket', { request: { type: 'close', id: 7 } });
});
