import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { PortForwardingService, type ForwardingClient } from './service';
import type { TerminalLinkReply } from '../../../../../../shared/terminal/links';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
let service: PortForwardingService;
let client: ForwardingClient;
let nextId: number;
const flush = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks(); nextId = 0;
  client = { openResource: vi.fn(async () => `resource-${++nextId}`), closeResource: vi.fn(async () => undefined),
    link: vi.fn(async (_id, request): Promise<TerminalLinkReply> => request.type === 'connect'
      ? { type: 'socket', id: `remote-${++nextId}` } : { type: 'done' }) };
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const request = (args as { request: { type: string; port?: number } }).request;
    if (request.type === 'listen') return { type: 'listener', id: `local-${request.port}`, port: request.port };
    if (request.type === 'accept') return new Promise(() => undefined);
    return { type: 'done' };
  });
  service = new PortForwardingService(client); service.setConnected(true);
});
afterEach(async () => { service.dispose(); await flush(); });

it('maps multiple remote ports through authenticated resources and stops them independently', async () => {
  service.add(3000, 13000); service.add(5432, 15432); await flush();
  expect(service.snapshot().map(entry => entry.status)).toEqual(['running', 'running']);
  expect(client.openResource).toHaveBeenCalledWith('http://127.0.0.1:3000');
  expect(client.openResource).toHaveBeenCalledWith('http://127.0.0.1:5432');
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link', { request: { type: 'listen', port: 13000 } });
  const [first, second] = service.snapshot();
  await service.stop(first.id);
  expect(service.snapshot().map(entry => entry.status)).toEqual(['stopped', 'running']);
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link', { request: { type: 'stop', scope: 'local-13000' } });
  expect(client.closeResource).toHaveBeenCalledTimes(1);
  await service.start(first.id);
  expect(service.snapshot()[0].status).toBe('running');
  await service.remove(second.id);
  expect(service.snapshot().map(entry => entry.id)).toEqual([first.id]);
});

it('reports occupied local ports and releases the remote resource before retry', async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if ((args as { request: { type: string } }).request.type === 'listen') {
      throw '本地端口已被占用，请换一个端口。';
    }
    return original(command, args);
  });
  service.add(3000, 3000); await flush();
  expect(service.snapshot()[0]).toMatchObject({ status: 'error', error: '本地端口已被占用，请换一个端口。' });
  expect(client.closeResource).toHaveBeenCalledTimes(1);
  vi.mocked(invoke).mockImplementation(original);
  await service.start(service.snapshot()[0].id);
  expect(service.snapshot()[0].status).toBe('running');
});

it('rejects invalid, duplicate and excessive mappings without starting extra resources', async () => {
  for (const port of [0, -1, 65536, 3.5, NaN]) expect(() => service.add(port, 3000)).toThrow('端口号');
  service.add(3000, 13000);
  expect(() => service.add(4000, 13000)).toThrow('已有映射');
  for (let index = 1; index < 8; index++) service.add(3000 + index, 13000 + index);
  expect(() => service.add(4000, 14000)).toThrow('最多添加');
  await flush(); expect(client.openResource).toHaveBeenCalledTimes(8);
});

it('releases an open arriving after deletion without affecting its replacement', async () => {
  let finish!: (id: string) => void;
  vi.mocked(client.openResource).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  service.add(3000, 13000);
  await service.remove(service.snapshot()[0].id);
  service.add(4000, 13000); await flush();
  finish('late-resource'); await flush();
  expect(client.closeResource).toHaveBeenCalledWith('late-resource');
  expect(service.snapshot()).toHaveLength(1);
  expect(service.snapshot()[0]).toMatchObject({ remotePort: 4000, status: 'running' });
});

it('stops all mappings on disconnect and keeps saved ports ready for manual restart', async () => {
  service.add(3000, 13000); service.add(5432, 15432); await flush();
  service.setConnected(false); await flush();
  expect(service.snapshot().map(entry => entry.status)).toEqual(['stopped', 'stopped']);
  expect(client.closeResource).toHaveBeenCalledTimes(2);
  await service.start(service.snapshot()[0].id);
  expect(client.openResource).toHaveBeenCalledTimes(2);
  service.setConnected(true); await service.start(service.snapshot()[0].id);
  expect(service.snapshot()[0].status).toBe('running');
});

it('cleans up a listener created while its mapping is being stopped', async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  let finish!: (reply: TerminalLinkReply) => void;
  vi.mocked(invoke).mockImplementation((command, args) =>
    (args as { request: { type: string } }).request.type === 'listen'
      ? new Promise(resolve => { finish = resolve; }) : original(command, args));
  service.add(3000, 13000); await flush();
  const stopped = service.stop(service.snapshot()[0].id);
  finish({ type: 'listener', id: 'late-listener', port: 13000 });
  await stopped; await flush();
  expect(service.snapshot()[0].status).toBe('stopped');
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link', { request: { type: 'stop', scope: 'late-listener' } });
  expect(client.closeResource).toHaveBeenCalledTimes(1);
});

it('marks an unexpectedly closed listener as failed and releases its remote resource', async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  let fail!: (error: Error) => void;
  vi.mocked(invoke).mockImplementation((command, args) =>
    (args as { request: { type: string } }).request.type === 'accept'
      ? new Promise((_resolve, reject) => { fail = reject; }) : original(command, args));
  service.add(3000, 13000); await flush();
  fail(new Error('Listener gone')); await flush();
  expect(service.snapshot()[0]).toMatchObject({ status: 'error', error: '映射已中断，请重新启动。' });
  expect(client.closeResource).toHaveBeenCalledTimes(1);
});
