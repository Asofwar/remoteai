import { invoke } from '@tauri-apps/api/core';
import type { GuiToolsClient } from '../../../../../../shared/remote-chat/guiTools';
import { websiteUrl, type TerminalLinkReply, type TerminalLinkRequest } from '../../../../../../shared/terminal/links';

type LocalRequest = (TerminalLinkRequest & { scope: string })
  | { type: 'listen' } | { type: 'accept' | 'stop'; scope: string };
type NativeRequest = (request: LocalRequest) => Promise<TerminalLinkReply>;
const nativeRequest: NativeRequest = request => invoke('codex_gui_terminal_link', { request });
type Endpoint = { request: (request: TerminalLinkRequest) => Promise<TerminalLinkReply>; id: string };
const MAX_BRIDGES = 8;

/** One loopback listener per remote origin keeps HTTP, assets and WebSockets on the same remote computer. */
export class TerminalLinkTunnels {
  private closed = false;
  private readonly listeners = new Map<string, Promise<{ id: string; port: number }>>();
  private readonly bridges = new Set<() => void>();

  constructor(private readonly client: GuiToolsClient['terminal'], private readonly native = nativeRequest) {}

  resolve = async (terminal: string, value: string): Promise<string> => {
    const url = websiteUrl(value);
    if (!url || this.closed) throw new Error('链接无效，请检查后重试。');
    const key = JSON.stringify([terminal, url.origin]);
    let pending = this.listeners.get(key);
    if (!pending) {
      pending = this.listen(terminal, url.origin, key);
      this.listeners.set(key, pending);
    }
    const listener = await pending;
    url.hostname = '127.0.0.1'; url.port = String(listener.port);
    return url.href;
  };

  close() {
    this.closed = true;
    for (const close of this.bridges) close();
    for (const listener of this.listeners.values()) {
      void listener.then(value => this.native({ type: 'stop', scope: value.id })).catch(() => undefined);
    }
    this.listeners.clear();
  }

  private async listen(terminal: string, url: string, key: string) {
    try {
      // Validate host support and the server before presenting a URL that looks ready to open.
      const probe = await this.client.link(terminal, { type: 'connect', url });
      if (probe.type !== 'socket') throw new Error('无法连接网页，请确认服务已启动。');
      await this.client.link(terminal, { type: 'close', id: probe.id });
      const reply = await this.native({ type: 'listen' });
      if (reply.type !== 'listener') throw new Error('无法连接网页，请稍后重试。');
      if (this.closed) {
        await this.native({ type: 'stop', scope: reply.id });
        throw new Error('网页连接已断开，请重新打开链接。');
      }
      void this.accept({ terminal, url, scope: reply.id }).finally(() => this.listeners.delete(key));
      return reply;
    } catch (error) { this.listeners.delete(key); throw error; }
  }

  private async accept(target: { terminal: string; url: string; scope: string }) {
    try {
      while (!this.closed) {
        const reply = await this.native({ type: 'accept', scope: target.scope });
        if (reply.type === 'socket') void this.bridge(target, reply.id);
      }
    } catch { /* A disconnected view releases its listener; reopening creates a fresh one. */ }
    finally { await this.native({ type: 'stop', scope: target.scope }).catch(() => undefined); }
  }

  private async bridge(target: { terminal: string; url: string; scope: string }, id: string) {
    const local: Endpoint = { id, request: request => this.native({ ...request, scope: target.scope }) };
    if (this.closed || this.bridges.size >= MAX_BRIDGES) {
      await local.request({ type: 'close', id }).catch(() => undefined); return;
    }
    let remote: Endpoint | undefined;
    let stopped = false;
    const close = () => {
      stopped = true;
      void local.request({ type: 'close', id }).catch(() => undefined);
      if (remote) void remote.request({ type: 'close', id: remote.id }).catch(() => undefined);
    };
    this.bridges.add(close);
    try {
      const reply = await this.client.link(target.terminal, { type: 'connect', url: target.url });
      if (reply.type !== 'socket') throw new Error('Unexpected link response');
      remote = { id: reply.id, request: request => this.client.link(target.terminal, request) };
      if (this.closed || stopped) return;
      await Promise.race([pump(local, remote), pump(remote, local)]);
    } catch { /* Closing both sockets makes network errors visible in the browser's normal retry UI. */ }
    finally { close(); this.bridges.delete(close); }
  }
}

async function pump(source: Endpoint, destination: Endpoint) {
  for (;;) {
    const reply = await source.request({ type: 'read', id: source.id });
    if (reply.type !== 'data') throw new Error('Unexpected link response');
    if (reply.data) await destination.request({ type: 'write', id: destination.id, data: reply.data });
    if (reply.eof) return;
  }
}
