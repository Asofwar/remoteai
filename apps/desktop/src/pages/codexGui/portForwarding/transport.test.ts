import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { hotLinkHarness } from '../../../remoteChat/hotLinkHarness';
import { ChatRpc } from '../../../../../../shared/remote-chat/rpc';
import { createGuiFilesClient } from '../../../../../../shared/remote-chat/files';
import type { RpcMessage } from '../../../../../../shared/remote-chat/protocol';
import type { TerminalLinkReply, TerminalLinkRequest } from '../../../../../../shared/terminal/links';
import { PortForwardingService } from './service';
import { LINK_CHUNK_BYTES } from '../../../../../../shared/terminal/linkChunks';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
type Reply = (reply: TerminalLinkReply) => void;

function transportFixture() {
  let sequence = 0;
  let rpc: ChatRpc;
  const resources = new Set<string>();
  const remoteReads = new Map<string, Reply>();
  const messages = (side: 'phone' | 'pc', message: RpcMessage) => {
    if (side === 'phone') { rpc.receive(message); return; }
    if (message.kind !== 'request') return;
    const body = message.body as { operation: string; id: string; request: TerminalLinkRequest };
    const reply = (data: unknown) => { void harness.links.pc.send({ kind: 'response', id: message.id, data }); };
    if (body.operation === 'guiResourceOpen') {
      const id = `resource-${++sequence}`; resources.add(id); reply(id); return;
    }
    if (body.operation === 'guiResourceClose') { resources.delete(body.id); reply(null); return; }
    const request = body.request;
    if (request.type === 'connect') { reply({ type: 'socket', id: `socket-${++sequence}` }); return; }
    if (request.type === 'read') { remoteReads.set(request.id, reply); return; }
    if (request.type === 'write') remoteReads.get(request.id)?.({ type: 'data', data: request.data, eof: false });
    if (request.type === 'close') {
      remoteReads.get(request.id)?.({ type: 'data', data: '', eof: true }); remoteReads.delete(request.id);
    }
    reply({ type: 'done' });
  };
  const harness = hotLinkHarness({ onMessage: messages });
  rpc = new ChatRpc({ prefix: 'forwarding', send: message => harness.links.phone.send(message), event() {} });
  const client = createGuiFilesClient(<T>(body: object) => rpc.request<T>('request', body));
  return { harness, rpc, client, resources };
}

function localFixture() {
  const accepts = new Map<string, Reply>();
  const reads = new Map<string, Reply>();
  const received = new Map<string, string[]>();
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const request = (args as {
      request: { type: string; port: number; scope: string; id: string; data: string };
    }).request;
    if (request.type === 'listen') return { type: 'listener', id: String(request.port), port: request.port };
    if (request.type === 'accept') return new Promise(resolve => accepts.set(request.scope, resolve));
    if (request.type === 'read') return new Promise(resolve => reads.set(request.id, resolve));
    if (request.type === 'write') received.set(request.id, [...received.get(request.id) ?? [], request.data]);
    if (request.type === 'close') {
      reads.get(request.id)?.({ type: 'data', data: '', eof: true }); reads.delete(request.id);
    }
    if (request.type === 'stop') accepts.get(request.scope)?.({ type: 'done' });
    return { type: 'done' };
  });
  return { accepts, reads, received };
}

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

it.each([8, LINK_CHUNK_BYTES])('keeps mapped bytes on P2P and relay (payload size %s)', async size => {
  vi.useFakeTimers();
  const local = localFixture();
  const transport = transportFixture();
  const service = new PortForwardingService(transport.client);
  try {
    await vi.advanceTimersByTimeAsync(4500);
    service.setConnected(true); service.add(3000, 13000); service.add(5432, 15432);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.snapshot().map(entry => entry.status)).toEqual(['running', 'running']);
    local.accepts.get('13000')!({ type: 'socket', id: 'browser' });
    local.accepts.get('15432')!({ type: 'socket', id: 'database' });
    await vi.advanceTimersByTimeAsync(100);
    for (const mode of ['direct', 'relay'] as const) {
      if (mode === 'relay') { transport.harness.paths.direct = false; await vi.advanceTimersByTimeAsync(4500); }
      expect(transport.harness.links.phone.connectionMode).toBe(mode);
      const start = transport.harness.packets.length;
      const bytes = btoa(`\0\xff${mode}`.padEnd(size, 'x'));
      for (const id of ['browser', 'database']) local.reads.get(id)!({ type: 'data', data: bytes, eof: false });
      await vi.advanceTimersByTimeAsync(100);
      for (const id of ['browser', 'database']) expect(local.received.get(id)?.at(-1)).toBe(bytes);
      const packets = transport.harness.packets.slice(start).filter(packet => packet.frame.kind === 'data');
      expect(packets.length).toBeGreaterThan(0);
      expect(packets.every(packet => packet.path === mode)).toBe(true);
      expect(service.snapshot().map(entry => entry.status)).toEqual(['running', 'running']);
    }
    service.dispose(); await vi.advanceTimersByTimeAsync(100);
    expect(transport.resources.size).toBe(0);
    expect(service.snapshot().map(entry => entry.status)).toEqual(['stopped', 'stopped']);
    expect(transport.harness.error).not.toHaveBeenCalled();
  } finally { service.dispose(); transport.rpc.close(); transport.harness.close(); }
});
