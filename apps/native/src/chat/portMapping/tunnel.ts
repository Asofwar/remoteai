import TcpSocket from 'react-native-tcp-socket';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';
import type { MappingTunnel, MappingTunnelOptions } from '../../../../../shared/port-mapping/types';
import { retainPortMappingConnection } from '../backgroundConnection';
import { bridgeSocket } from './socketBridge';

const START_TIMEOUT_MS = 10_000;
const LOOPBACK = '127.0.0.1';
const PORT_UNAVAILABLE = '无法监听本地端口，请换一个端口重试。';

export class NativeMappingTunnel implements MappingTunnel {
  private closed = false;
  private server?: ReturnType<typeof TcpSocket.createServer>;
  private starting?: Promise<string>;
  private stopping?: Promise<void>;
  private releaseBackground?: () => Promise<void>;
  private readonly bridges = new Set<() => void>();

  constructor(private readonly client: ForwardingClient, private readonly options: MappingTunnelOptions) {}

  resolve = (resource: string, url: string) => {
    this.starting ??= this.start(resource, url);
    return this.starting;
  };

  close = (): Promise<void> => {
    this.closed = true;
    this.stopping ??= this.shutdown();
    return this.stopping;
  };

  private async start(resource: string, url: string) {
    this.releaseBackground = await retainPortMappingConnection();
    if (this.closed) throw new Error('Mapping closed');
    const probe = await this.client.link(resource, { type: 'connect', url });
    if (probe.type !== 'socket') throw new Error('Unexpected socket response');
    await this.client.link(resource, { type: 'close', id: probe.id });
    if (this.closed) throw new Error('Mapping closed');
    return this.listen(resource, url);
  }

  private listen(resource: string, url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let started = false;
      const server = TcpSocket.createServer(socket => this.accept({ socket, resource, url }));
      this.server = server;
      const timer = setTimeout(() => reject(new Error(PORT_UNAVAILABLE)), START_TIMEOUT_MS);
      server.on('error', error => {
        clearTimeout(timer);
        if (started) this.options.onClosed();
        else reject(new Error(/EADDRINUSE|address.*use|bind failed/i.test(String(error?.message ?? error))
          ? '本地端口已被占用，请换一个端口。' : PORT_UNAVAILABLE));
      });
      server.on('close', () => { if (started && !this.closed) this.options.onClosed(); });
      server.listen({ host: LOOPBACK, port: this.options.localPort, reuseAddress: true }, () => {
        clearTimeout(timer);
        started = true;
        if (this.closed) server.close();
        resolve(`http://${LOOPBACK}:${this.options.localPort}`);
      });
    });
  }

  private accept(target: { socket: InstanceType<typeof TcpSocket.Socket>; resource: string; url: string }) {
    const budget = this.options.bridgeBudget;
    if (this.closed || budget.active >= budget.limit) { target.socket.destroy(); return; }
    budget.active++;
    const bridge = bridgeSocket({ ...target, client: this.client });
    this.bridges.add(bridge.close);
    void bridge.done.finally(() => { this.bridges.delete(bridge.close); budget.active--; });
  }

  private async shutdown() {
    // A cancelled start may still acquire a listener or background lease; release both before returning.
    await this.starting?.catch(() => undefined);
    for (const close of this.bridges) close();
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    await this.releaseBackground?.();
  }
}
