import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { PortForwardingService, type ForwardingClient } from './service';
import type { TerminalLinkReply } from '../../../../../../shared/terminal/links';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const flush = async () => { for (let index = 0; index < 80; index++) await Promise.resolve(); };
const client: ForwardingClient = {
  openResource: vi.fn(async () => 'resource'), closeResource: vi.fn(async () => {}),
  stream: vi.fn(async () => ({ read: vi.fn(), write: vi.fn(), close: vi.fn() })),
  link: vi.fn(async (_id, request): Promise<TerminalLinkReply> => {
    if (request.type === 'udpConnect' || request.type === 'connect') return { type: 'socket', id: request.type };
    if (request.type === 'udpRead') return new Promise(() => {});
    return { type: 'done' };
  }),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const request = (args as { request: { type: string; port: number } }).request;
    if (request.type === 'udpListen' || request.type === 'listen') {
      return { type: 'listener', id: request.type, port: request.port };
    }
    if (request.type === 'udpRead' || request.type === 'accept') return new Promise(() => {});
    return { type: 'done' };
  });
});

it('starts both protocols and restarts protocol edits without losing the saved mapping', async () => {
  const service = new PortForwardingService(client); service.setConnected(true);
  service.add(53, 1053, '', 'both'); await flush();
  const entry = service.snapshot()[0];
  expect(entry.status).toBe('running');
  for (const type of ['udpListen', 'listen']) expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link',
    { request: { type, port: 1053 } });
  await service.edit(entry.id, { remotePort: 53, localPort: 1053, protocol: 'udp' });
  expect(service.snapshot()[0]).toMatchObject({ id: entry.id, protocol: 'udp', status: 'running' });
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link', { request: { type: 'stop', scope: 'listen' } });
  await service.stop(entry.id);
  expect(client.link).toHaveBeenCalledWith('resource', { type: 'udpClose', id: 'udpConnect' });
  expect(client.closeResource).toHaveBeenCalledTimes(2);
});

it('releases UDP and its resource when the TCP half cannot bind', async () => {
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if ((args as { request: { type: string } }).request.type === 'listen') throw '本地端口已被占用，请换一个端口。';
    return original(command, args);
  });
  const service = new PortForwardingService(client); service.setConnected(true);
  service.add(53, 1053, '', 'both'); await flush();
  expect(service.snapshot()[0]).toMatchObject({ status: 'error', error: '本地端口已被占用，请换一个端口。' });
  expect(invoke).toHaveBeenCalledWith('codex_gui_terminal_link',
    { request: { type: 'udpClose', scope: 'udpListen', id: 'udpListen' } });
  expect(client.closeResource).toHaveBeenCalledTimes(1);
});

it('reports unsupported UDP and releases a late session after startup cancellation', async () => {
  const link = vi.fn<ForwardingClient['link']>().mockRejectedValue(new Error('Old host'));
  const service = new PortForwardingService({ ...client, link }); service.setConnected(true);
  service.add(53, 1053, '', 'udp'); await flush();
  expect(service.snapshot()[0].error).toContain('两端应用均已更新');
  let finish!: (reply: TerminalLinkReply) => void;
  link.mockImplementation(async (_id, request) => request.type === 'udpConnect'
    ? new Promise(resolve => { finish = resolve; }) : { type: 'done' });
  const id = service.snapshot()[0].id;
  const starting = service.start(id); await flush();
  const stopping = service.stop(id);
  finish({ type: 'socket', id: 'late' });
  await Promise.all([starting, stopping]);
  expect(link).toHaveBeenCalledWith('resource', { type: 'udpClose', id: 'late' });
  expect(service.snapshot()[0].status).toBe('stopped');
  expect(invoke).not.toHaveBeenCalled();
});
