import type { GuiToolsClient } from '../remote-chat/guiTools';
import type { MappingTunnel, TunnelFactory } from './types';
import { MAX_PORT_MAPPINGS, validPort, type PortMapping } from './settings';
import { StreamBudget } from './streamBudget';

export type ForwardingClient = Pick<GuiToolsClient['files'], 'openResource' | 'closeResource' | 'link'>;
export interface ForwardingEntry extends PortMapping {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  error?: string;
}
interface RunningMapping { tunnels: MappingTunnel; resource?: string }
const START_ERROR = '映射未能启动，请确认远程服务已启动后重试。';
const LOCAL_ERRORS = new Set(['本地端口已被占用，请换一个端口。', '无法监听本地端口，请换一个端口重试。',
  '请更新应用后使用端口映射。', '请返回应用后重新启动映射。']);

/** One manager per authenticated computer; switching chat threads never releases its mappings. */
export class PortForwardingService {
  private connected = false;
  private entries: ForwardingEntry[];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, RunningMapping>();
  // Each stream keeps a remote read pending. Leave RPC capacity available for chat and other tools.
  private readonly bridgeBudget = new StreamBudget();

  constructor(private readonly client: ForwardingClient, saved: PortMapping[],
    private readonly platform: { createTunnel: TunnelFactory; createId: () => string }) {
    this.entries = saved.map(entry => ({ ...entry, status: 'stopped' }));
  }

  snapshot = () => this.entries;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setConnected = (connected: boolean) => {
    this.connected = connected;
    if (!connected) for (const id of this.running.keys()) void this.stop(id);
  };

  add = (remotePort: number, localPort: number) => {
    if (!validPort(remotePort) || !validPort(localPort)) throw new Error('请输入 1–65535 之间的端口号。');
    if (this.entries.some(entry => entry.localPort === localPort)) throw new Error('这个本地端口已有映射。');
    if (this.entries.length >= MAX_PORT_MAPPINGS) throw new Error('最多添加 8 条映射，请先删除一条。');
    const entry: ForwardingEntry = { id: this.platform.createId(), remotePort, localPort, status: 'stopped' };
    this.publish([...this.entries, entry]);
    void this.start(entry.id);
  };

  start = async (id: string) => {
    const entry = this.entries.find(value => value.id === id);
    if (!entry || !this.connected || this.running.has(id) || entry.status === 'stopping') return;
    const job: RunningMapping = { tunnels: this.platform.createTunnel(this.client, {
      localPort: entry.localPort, bridgeBudget: this.bridgeBudget,
      onClosed: () => { void this.fail(id, job, '映射已中断，请重新启动。'); },
    }) };
    this.running.set(id, job);
    this.update(id, { status: 'starting', error: undefined });
    try {
      // The existing resource protocol uses a URL only to identify a TCP destination; bytes stay unchanged.
      const url = `http://127.0.0.1:${entry.remotePort}`;
      job.resource = await this.client.openResource(url);
      if (this.running.get(id) !== job) { await this.release(job); return; }
      await job.tunnels.resolve(job.resource, url);
      if (this.running.get(id) !== job) { await this.release(job); return; }
      this.update(id, { status: 'running' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      await this.fail(id, job, LOCAL_ERRORS.has(message) ? message : START_ERROR);
    }
  };

  stop = async (id: string) => {
    const job = this.running.get(id);
    if (!job) return;
    this.running.delete(id);
    this.update(id, { status: 'stopping', error: undefined });
    await this.release(job);
    this.update(id, { status: 'stopped' });
  };

  remove = async (id: string) => {
    await this.stop(id);
    this.publish(this.entries.filter(entry => entry.id !== id));
  };

  dispose = () => { this.setConnected(false); };

  private async fail(id: string, job: RunningMapping, error: string) {
    if (this.running.get(id) !== job) { await this.release(job); return; }
    this.running.delete(id);
    this.update(id, { status: 'stopping' });
    await this.release(job);
    this.update(id, { status: 'error', error });
  }

  private async release(job: RunningMapping) {
    const resource = job.resource;
    job.resource = undefined;
    await job.tunnels.close();
    if (resource) await this.client.closeResource(resource)
      .catch(() => console.warn('Port forwarding remote cleanup failed'));
  }

  private update(id: string, change: Partial<ForwardingEntry>) {
    this.publish(this.entries.map(entry => entry.id === id ? { ...entry, ...change } : entry));
  }

  private publish(entries: ForwardingEntry[]) {
    this.entries = entries;
    for (const listener of this.listeners) listener();
  }
}
