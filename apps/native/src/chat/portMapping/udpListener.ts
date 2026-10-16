import dgram from 'react-native-udp';
import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import { randomUUID } from 'expo-crypto';
import type { UdpPacket } from '../../../../../shared/terminal/links';
import { UDP_MAX_BATCH, UDP_MAX_DATAGRAM, UDP_MAX_PEERS, UDP_PEER_IDLE_MS, UDP_QUEUE_SIZE,
  type DatagramEndpoint, type UdpListenerFactory } from '../../../../../shared/port-mapping/udpTunnel';
import { retainPortMappingConnection } from '../backgroundConnection';

const LOOPBACK = '127.0.0.1';
const START_TIMEOUT_MS = 10_000;
interface Peer { address: string; port: number; seen: number }

export const listenUdp: UdpListenerFactory = async port => {
  if (!NativeModules.UdpSockets) throw new Error('请更新应用后使用端口映射。');
  const release = await retainPortMappingConnection();
  let endpoint: NativeUdpEndpoint | undefined;
  try {
    endpoint = new NativeUdpEndpoint(release);
    await endpoint.bind(port);
    return endpoint;
  } catch (error) {
    if (endpoint) await endpoint.close(); else await release();
    throw error;
  }
};

class NativeUdpEndpoint implements DatagramEndpoint {
  private readonly socket = dgram.createSocket({ type: 'udp4', reusePort: false });
  private readonly peers = new Map<string, Peer>();
  private readonly queue: UdpPacket[] = [];
  private wake?: () => void;
  private failure?: Error;
  private stopping?: Promise<void>;

  constructor(private readonly release: () => Promise<void>) {
    this.socket.on('message', (bytes: Buffer, source: { address: string; port: number }) =>
      this.receive(bytes, source));
    this.socket.on('error', (error: Error) => { this.failure = error; this.wake?.(); });
    this.socket.on('close', () => { this.failure ??= new Error('UDP listener closed'); this.wake?.(); });
  }

  bind(port: number) {
    return new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        cleanup();
        reject(new Error(/EADDRINUSE|address.*use|bind failed/i.test(String(error?.message ?? error))
          ? '本地端口已被占用，请换一个端口。' : '无法监听本地端口，请换一个端口重试。'));
      };
      const ready = () => { cleanup(); resolve(); };
      const cleanup = () => {
        clearTimeout(timer); this.socket.off('error', failed); this.socket.off('listening', ready);
      };
      const timer = setTimeout(() => failed(new Error('Bind timeout')), START_TIMEOUT_MS);
      this.socket.once('error', failed); this.socket.once('listening', ready);
      try { this.socket.bind(port, LOOPBACK); } catch (error) { failed(error as Error); }
    });
  }

  private receive(bytes: Buffer, source: { address: string; port: number }) {
    if (this.stopping || source.address !== LOOPBACK || bytes.length > UDP_MAX_DATAGRAM) return;
    this.expire();
    let peer = [...this.peers].find(([, value]) => value.address === source.address && value.port === source.port)?.[0];
    if (!peer && this.peers.size >= UDP_MAX_PEERS) return;
    peer ??= randomUUID();
    this.peers.set(peer, { ...source, seen: Date.now() });
    if (this.queue.length < UDP_QUEUE_SIZE) this.queue.push({ peer, data: bytes.toString('base64') });
    this.wake?.();
  }

  async read() {
    if (!this.failure && !this.queue.length) await new Promise<void>(resolve => { this.wake = resolve; });
    this.wake = undefined;
    if (this.failure) throw this.failure;
    return this.queue.splice(0, UDP_MAX_BATCH);
  }

  async write(packets: UdpPacket[]) {
    this.expire();
    if (packets.length > UDP_MAX_BATCH) throw new Error('Invalid UDP batch');
    for (const packet of packets) {
      const peer = this.peers.get(packet.peer);
      if (!peer || this.stopping) continue;
      if (packet.data.length > Math.ceil(UDP_MAX_DATAGRAM / 3) * 4) throw new Error('Invalid UDP datagram');
      const bytes = Buffer.from(packet.data, 'base64');
      if (bytes.length > UDP_MAX_DATAGRAM) throw new Error('Invalid UDP datagram');
      peer.seen = Date.now();
      await new Promise<void>((resolve, reject) => this.socket.send(bytes, 0, bytes.length, peer.port, peer.address,
        error => error ? reject(error) : resolve()));
    }
  }

  close = () => {
    this.failure ??= new Error('UDP listener closed'); this.wake?.();
    this.stopping ??= new Promise<void>((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.close(() => { this.socket.off('error', reject); resolve(); });
    }).finally(async () => { this.peers.clear(); this.queue.length = 0; await this.release(); });
    return this.stopping;
  };

  private expire() {
    for (const [id, peer] of this.peers) if (Date.now() - peer.seen >= UDP_PEER_IDLE_MS) this.peers.delete(id);
  }
}
