import type { Channel, IceServer, Peer, PeerFactory, Signal } from './protocol';

const RESTART_INTERVAL_MS = 10_000;
export type RecoverySignal = Exclude<Signal, { kind: 'key' }> & { generation?: number };

/** Only the phone starts a new ICE generation, avoiding simultaneous offers. */
export class HotPeer {
  private peer?: Peer;
  private generation = 0;
  private lastAttempt = 0;
  private closed = false;
  constructor(private readonly options: {
    desktop: boolean; iceServers: IceServer[]; createPeer: PeerFactory;
    signal: (signal: RecoverySignal) => void; channel: (channel: Channel) => void; disconnected: () => void;
  }) { this.create(); }

  private create() {
    const generation = this.generation;
    this.peer?.close();
    this.lastAttempt = Date.now();
    try {
      this.peer = this.options.createPeer({
        iceServers: this.options.iceServers,
        signal: (signal) => {
          if (signal.kind === 'key') return;
          if (!this.closed && generation === this.generation) this.options.signal({ ...signal, generation });
        },
        channel: (channel) => {
          if (this.closed || generation !== this.generation) channel.close();
          else this.options.channel(channel);
        },
        disconnected: () => {
          if (!this.closed && generation === this.generation) this.options.disconnected();
        },
      });
    } catch { this.peer = undefined; }
  }

  async offer() {
    try { await this.peer?.offer(); } catch { this.options.disconnected(); }
  }

  async accept(signal: RecoverySignal) {
    const generation = signal.generation ?? 0;
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Invalid ICE generation');
    if (generation < this.generation || this.closed) return;
    if (generation > this.generation) {
      if (!this.options.desktop) return;
      this.generation = generation;
      this.create();
    }
    try { await this.peer?.accept(signal); } catch { this.options.disconnected(); }
  }

  recover(healthy: boolean, signaling: boolean) {
    if (healthy || !signaling || this.options.desktop || this.closed
      || Date.now() - this.lastAttempt < RESTART_INTERVAL_MS) return;
    this.generation += 1;
    this.create();
    void this.offer();
  }

  close() { this.closed = true; this.peer?.close(); }
}
