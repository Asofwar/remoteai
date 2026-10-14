import { expect, it, vi } from 'vitest';
import { TerminalLinkTunnels } from './linkTunnel';
import type { TerminalLinkReply } from '../../../../../../shared/terminal/links';

const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
const client = () => ({ list: vi.fn(), open: vi.fn(), read: vi.fn(), write: vi.fn(), resize: vi.fn(), close: vi.fn(),
  link: vi.fn(async (): Promise<TerminalLinkReply> => ({ type: 'socket', id: 'remote-socket' })) });

it('reuses the origin tunnel and retains URL paths, queries and fragments for the selected terminal', async () => {
  const remote = client();
  const native = vi.fn(async (request: { type: string }): Promise<TerminalLinkReply> => {
    if (request.type === 'listen') return { type: 'listener', id: 'listener', port: 54321 };
    if (request.type === 'accept') return new Promise(() => undefined);
    return { type: 'done' };
  });
  const tunnels = new TerminalLinkTunnels(remote, native);
  await expect(tunnels.resolve('remote-terminal', 'http://localhost:3002/path?q=yes#section'))
    .resolves.toBe('http://127.0.0.1:54321/path?q=yes#section');
  await tunnels.resolve('remote-terminal', 'http://localhost:3002/other');
  expect(native.mock.calls.filter(([request]) => request.type === 'listen')).toHaveLength(1);
  expect(remote.link).toHaveBeenCalledWith('remote-terminal', { type: 'connect', url: 'http://localhost:3002' });
  tunnels.close(); await flush();
  expect(native).toHaveBeenCalledWith({ type: 'stop', scope: 'listener' });
});

it('closes both sides after forwarding HTTP/WebSocket bytes and releases listeners on exit', async () => {
  const remote = client();
  let readRemote!: (reply: TerminalLinkReply) => void;
  remote.link.mockImplementation(async (_terminal?: string, request?: { type: string }) => {
    if (request?.type === 'connect') return { type: 'socket', id: 'remote-socket' };
    if (request?.type === 'read') return new Promise(resolve => { readRemote = resolve; });
    return { type: 'done' };
  });
  let accepted = false;
  let readLocal!: (reply: TerminalLinkReply) => void;
  const native = vi.fn(async (request: { type: string }): Promise<TerminalLinkReply> => {
    if (request.type === 'listen') return { type: 'listener', id: 'listener', port: 54321 };
    if (request.type === 'accept' && !accepted) { accepted = true; return { type: 'socket', id: 'browser' }; }
    if (request.type === 'accept') return new Promise(() => undefined);
    if (request.type === 'read') return new Promise(resolve => { readLocal = resolve; });
    return { type: 'done' };
  });
  const tunnels = new TerminalLinkTunnels(remote, native);
  await tunnels.resolve('terminal', 'http://localhost:3002'); await flush();
  readLocal({ type: 'data', data: 'aHR0cA==', eof: false }); await flush();
  expect(remote.link).toHaveBeenCalledWith('terminal', { type: 'write', id: 'remote-socket', data: 'aHR0cA==' });
  readRemote({ type: 'data', data: 'd2Vic29ja2V0', eof: true }); await flush();
  expect(native).toHaveBeenCalledWith({ type: 'write', scope: 'listener', id: 'browser', data: 'd2Vic29ja2V0' });
  expect(native).toHaveBeenCalledWith({ type: 'close', scope: 'listener', id: 'browser' });
  expect(remote.link).toHaveBeenCalledWith('terminal', { type: 'close', id: 'remote-socket' });
  tunnels.close();
});

it('shares the stream budget between mappings and returns capacity when a connection ends', async () => {
  const remote = client();
  const accepts = new Map<string, (reply: TerminalLinkReply) => void>();
  const reads = new Map<string, (reply: TerminalLinkReply) => void>();
  remote.link.mockImplementation(async (_terminal?: string, request?: { type: string }) => {
    if (request?.type === 'connect') return { type: 'socket', id: 'remote' };
    if (request?.type === 'read') return new Promise(() => undefined);
    return { type: 'done' };
  });
  const native = vi.fn(async (request: { type: string; port?: number; scope?: string; id?: string }) => {
    if (request.type === 'listen') return { type: 'listener' as const, id: String(request.port), port: request.port! };
    if (request.type === 'accept') return new Promise<TerminalLinkReply>(resolve => accepts.set(request.scope!, resolve));
    if (request.type === 'read') return new Promise<TerminalLinkReply>(resolve => reads.set(request.id!, resolve));
    return { type: 'done' as const };
  });
  const bridgeBudget = { active: 0, limit: 1 };
  const first = new TerminalLinkTunnels(remote, native, { localPort: 13000, bridgeBudget });
  const second = new TerminalLinkTunnels(remote, native, { localPort: 15432, bridgeBudget });
  await first.resolve('first', 'http://localhost:3000');
  await second.resolve('second', 'http://localhost:5432');
  accepts.get('13000')!({ type: 'socket', id: 'one' }); await flush();
  accepts.get('15432')!({ type: 'socket', id: 'two' }); await flush();
  expect(bridgeBudget.active).toBe(1);
  expect(native).toHaveBeenCalledWith({ type: 'close', id: 'two', scope: '15432' });
  reads.get('one')!({ type: 'data', data: '', eof: true }); await flush();
  expect(bridgeBudget.active).toBe(0);
  accepts.get('15432')!({ type: 'socket', id: 'three' }); await flush();
  expect(bridgeBudget.active).toBe(1);
  reads.get('three')!({ type: 'data', data: '', eof: true }); await flush();
  await first.close(); await second.close();
});
