import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { hotLinkHarness } from '../../../remoteChat/hotLinkHarness';
import { ChatRpc } from '../../../../../../shared/remote-chat/rpc';
import { createGuiFilesClient } from '../../../../../../shared/remote-chat/files';
import type { RpcMessage } from '../../../../../../shared/remote-chat/protocol';
import type { TerminalLinkReply, TerminalLinkRequest, UdpPacket } from '../../../../../../shared/terminal/links';
import { PortForwardingService } from './service';
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
    if (request.type === 'udpConnect') {
      reply({ type: 'socket', id: `socket-${++sequence}` }); return;
    }
    if (request.type === 'udpRead') { remoteReads.set(request.id, reply); return; }
    if (request.type === 'udpWrite') remoteReads.get(request.id)?.({ type: 'datagrams', packets: request.packets });
    if (request.type === 'udpClose') {
      remoteReads.get(request.id)?.({ type: 'datagrams', packets: [] }); remoteReads.delete(request.id);
    }
    reply({ type: 'done' });
  };
  const harness = hotLinkHarness({ onMessage: messages });
  rpc = new ChatRpc({ prefix: 'forwarding', send: message => harness.links.phone.send(message), event() {} });
  const client = createGuiFilesClient(<T>(body: object) => rpc.request<T>('request', body));
  return { harness, rpc, client, resources };
}

function localFixture() {
  const reads = new Map<string, Reply>();
  const datagrams: UdpPacket[][] = [];
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const request = (args as {
      request: { type: string; port: number; id: string; packets: UdpPacket[] };
    }).request;
    if (request.type === 'udpListen') {
      return { type: 'listener', id: String(request.port), port: request.port };
    }
    if (request.type === 'udpRead') return new Promise(resolve => reads.set(request.id, resolve));
    if (request.type === 'udpWrite') datagrams.push(request.packets);
    if (request.type === 'udpClose') {
      reads.get(request.id)?.({ type: 'datagrams', packets: [] }); reads.delete(request.id);
    }
    return { type: 'done' };
  });
  return { reads, datagrams };
}

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

it('preserves UDP datagram boundaries and peer IDs through encrypted P2P and relay switching', async () => {
  vi.useFakeTimers();
  const local = localFixture();
  const transport = transportFixture();
  const service = new PortForwardingService(transport.client);
  try {
    await vi.advanceTimersByTimeAsync(4500);
    service.setConnected(true); service.add(53, 1053, '', 'udp');
    await vi.advanceTimersByTimeAsync(100);
    expect(service.snapshot()[0].status).toBe('running');
    for (const mode of ['direct', 'relay'] as const) {
      if (mode === 'relay') { transport.harness.paths.direct = false; await vi.advanceTimersByTimeAsync(4500); }
      expect(transport.harness.links.phone.connectionMode).toBe(mode);
      const packets = [{ peer: 'one', data: '' }, { peer: 'two', data: btoa('x'.repeat(65507)) },
        { peer: 'one', data: btoa('binary') }];
      local.reads.get('1053')!({ type: 'datagrams', packets });
      await vi.advanceTimersByTimeAsync(100);
      expect(local.datagrams.at(-1)).toEqual(packets);
      expect(service.snapshot()[0].status).toBe('running');
    }
    service.dispose(); await vi.advanceTimersByTimeAsync(100);
    expect(transport.resources.size).toBe(0);
    expect(transport.harness.error).not.toHaveBeenCalled();
  } finally { service.dispose(); transport.rpc.close(); transport.harness.close(); }
});
