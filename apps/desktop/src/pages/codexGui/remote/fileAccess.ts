import type { GuiToolsClient } from '../../../../../../shared/remote-chat/guiTools';
import type { FileTarget } from '../../../../../../shared/remote-chat/files';
import { remoteDevelopmentUrl, websiteUrl } from '../../../../../../shared/terminal/links';
import { TerminalLinkTunnels } from '../terminal/linkTunnel';

type Client = GuiToolsClient['files'];
interface Tunnel { id: string; tunnels: TerminalLinkTunnels }
const MAX_WEBSITE_TUNNELS = 4;

/** Each instance belongs to one connection. No path or remote loopback URL is passed to local file IPC. */
export class RemoteFileAccess {
  private closed = false;
  private readonly previews = new Map<string, Tunnel>();
  private readonly websites = new Map<string, Promise<Tunnel>>();
  constructor(private readonly client: Client) {}

  private ensureOpen() {
    if (this.closed) throw new Error('连接已断开，请重新打开预览。');
  }

  open = async (target: FileTarget) => {
    this.ensureOpen();
    const data = await this.client.open(target);
    if (!data) return null;
    let tunnel: Tunnel | undefined;
    try {
      this.ensureOpen();
      tunnel = await this.createTunnel(data.url);
      const url = await tunnel.tunnels.resolve(tunnel.id, data.url);
      // The remote preview server still requires its secret path and an explicitly allowed Host header.
      await this.client.forwardHost(data.sessionId, new URL(url).host);
      this.ensureOpen();
      this.previews.set(data.sessionId, tunnel);
      return { ...data, url };
    } catch (error) {
      if (tunnel) this.releaseTunnel(tunnel);
      await this.client.close(data.sessionId).catch(() => console.warn('Remote preview cleanup failed'));
      throw error;
    }
  };

  close = async (id: string) => {
    const tunnel = this.previews.get(id);
    this.previews.delete(id);
    if (tunnel) this.releaseTunnel(tunnel);
    await this.client.close(id);
  };

  resolveWebsite = async (value: string) => {
    this.ensureOpen();
    const url = websiteUrl(value);
    if (!url) throw new Error('链接无效，请检查后重试。');
    if (!remoteDevelopmentUrl(value)) return value;
    let pending = this.websites.get(url.origin);
    if (!pending) {
      this.pruneWebsites();
      pending = this.createTunnel(url.origin).catch(error => { this.websites.delete(url.origin); throw error; });
      this.websites.set(url.origin, pending);
    }
    const tunnel = await pending;
    this.ensureOpen();
    return tunnel.tunnels.resolve(tunnel.id, value);
  };

  private pruneWebsites() {
    if (this.websites.size < MAX_WEBSITE_TUNNELS) return;
    const oldest = this.websites.entries().next().value;
    if (!oldest) return;
    this.websites.delete(oldest[0]);
    void oldest[1].then(value => this.releaseTunnel(value)).catch(() => undefined);
  }

  dispose = () => {
    this.closed = true;
    for (const id of this.previews.keys()) void this.close(id).catch(() => console.warn('Remote preview cleanup failed'));
    for (const pending of this.websites.values()) void pending.then(value => this.releaseTunnel(value))
      .catch(() => undefined); // Failed opens have already released their handles.
    this.websites.clear();
  };

  private async createTunnel(url: string): Promise<Tunnel> {
    const id = await this.client.openResource(url);
    const tunnel = { id, tunnels: new TerminalLinkTunnels(this.client) };
    if (this.closed) { this.releaseTunnel(tunnel); this.ensureOpen(); }
    return tunnel;
  }

  private releaseTunnel(tunnel: Tunnel) {
    tunnel.tunnels.close();
    void this.client.closeResource(tunnel.id).catch(() => console.warn('Remote stream cleanup failed'));
  }
}
