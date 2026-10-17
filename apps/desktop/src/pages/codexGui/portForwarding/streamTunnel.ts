import { invoke } from '@tauri-apps/api/core';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';
import type { MappingTunnel, MappingTunnelOptions } from '../../../../../../shared/port-mapping/types';
import { openMappingSocket, type MappingSocket } from '../../../../../../shared/port-mapping/socket';
import type { TerminalLinkReply } from '../../../../../../shared/terminal/links';

const local = (request: object) => invoke<TerminalLinkReply>('codex_gui_terminal_link', { request });
const closeSocket = (id: number) => invoke('port_mapping_socket', { request: { type: 'close', id } });
type Target = { scope: string; resource: string; url: string };

/** Manual desktop mappings require continuous encrypted streams and a native loopback sink. */
export class DesktopMappingTunnel implements MappingTunnel {
  private readonly abort = new AbortController();
  private readonly bridges = new Set<() => void>();
  private starting?: Promise<string>;
  private stopping?: Promise<void>;
  private listener?: string;

  constructor(private readonly client: ForwardingClient, private readonly options: MappingTunnelOptions) {}
  resolve = (resource: string, url: string) => this.starting ??= this.start(resource, url);
  close = () => {
    this.abort.abort();
    for (const close of this.bridges) close();
    return this.stopping ??= this.shutdown();
  };
  private async start(resource: string, url: string) {
    const probe = await openMappingSocket(this.client, resource, url, { signal: this.abort.signal });
    probe.close(); this.abort.signal.throwIfAborted();
    const reply = await local({ type: 'listen', port: this.options.localPort });
    if (reply.type !== 'listener') throw new Error('无法监听本地端口，请换一个端口重试。');
    this.listener = reply.id;
    if (!this.abort.signal.aborted) void this.accept({ scope: reply.id, resource, url });
    this.abort.signal.throwIfAborted();
    return `http://127.0.0.1:${reply.port}`;
  }
  private async accept(target: Target) {
    try {
      while (!this.abort.signal.aborted) {
        const reply = await local({ type: 'accept', scope: target.scope });
        if (reply.type === 'done') continue;
        if (reply.type !== 'socket') throw new Error('Mapping listener closed');
        const release = await this.options.bridgeBudget.acquire(this.abort.signal);
        if (!release || this.abort.signal.aborted) {
          release?.(); await local({ type: 'close', scope: target.scope, id: reply.id }); return;
        }
        void this.bridge(target, reply.id).finally(release);
      }
    } catch {
      if (!this.abort.signal.aborted) this.options.onClosed();
    }
  }
  private async bridge(target: Target, accepted: string) {
    let socket: number | undefined;
    let remote: MappingSocket | undefined;
    const abort = new AbortController();
    const close = () => {
      if (abort.signal.aborted) return;
      abort.abort(); remote?.close();
      if (socket !== undefined) void closeSocket(socket).catch(() => { /* Native lease is final cleanup. */ });
    };
    this.bridges.add(close);
    try {
      const attached = await invoke<{ type: 'socket'; id: number }>('port_mapping_socket', {
        request: { type: 'attach', scope: target.scope, id: accepted },
      });
      socket = attached.id;
      if (abort.signal.aborted) { await closeSocket(socket); return; }
      remote = await openMappingSocket(this.client, target.resource, target.url,
        { nativeSocketId: socket, signal: abort.signal });
      await Promise.race([upload(socket, remote, abort.signal), waitForDownload(remote)]);
    } catch { /* Closing both sockets makes failures visible to the local TCP client. */ }
    finally {
      close(); this.bridges.delete(close);
      await local({ type: 'close', scope: target.scope, id: accepted }).catch(() => {
        // A successfully attached socket was already transferred out of the listener registry.
      });
    }
  }
  private async shutdown() {
    await this.starting?.catch(() => undefined);
    if (this.listener) await local({ type: 'stop', scope: this.listener });
  }
}

async function upload(id: number, remote: MappingSocket, signal: AbortSignal) {
  for (;;) {
    signal.throwIfAborted();
    const reply = new Uint8Array(await invoke<ArrayBuffer>('port_mapping_read', { id }));
    if (!reply.length) throw new Error('Invalid local stream read');
    if (reply.length > 1) await remote.write(reply.subarray(1));
    if (reply[0] === 1) {
      if (!remote.end) throw new Error('Stream does not support half close');
      await remote.end();
      // A client may half-close its upload and continue reading the complete remote response.
      await new Promise<void>(resolve => {
        if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return;
    }
  }
}
async function waitForDownload(remote: MappingSocket) {
  for (;;) {
    const reply = await remote.read();
    if (reply.data.length) throw new Error('Native stream payload escaped its sink');
    if (reply.eof) return;
  }
}
