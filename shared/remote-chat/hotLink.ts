import { SessionCipher } from './cipher';
import { ReliableDelivery, deliveryFrame } from './delivery';
import { Assembler } from './framing';
import { SendQueue } from './sendQueue';
import { HotPeer } from './hotPeer';
import type { LinkOptions } from './linkOptions';
import { MAX_BUFFER_BYTES, type Channel, type ConnectionMode, type RpcMessage, type Signal } from './protocol';

type Path = 'direct' | 'relay';
const TICK_MS = 250;
const PROBE_MS = 1000;
const PATH_TIMEOUT_MS = 3000;
const DIRECT_STABLE_MS = 3000;
const OUTAGE_TIMEOUT_MS = 60_000;

/** Both paths stay open. Authenticated acknowledgements cover every fragment, including events. */
export class HotLink {
  private readonly peer: HotPeer;
  private readonly delivery: ReliableDelivery;
  // Reliable ordered fragments have already been acknowledged. Keep them until completion or session close.
  private readonly assembler = new Assembler(false);
  private readonly timer: ReturnType<typeof setInterval>;
  private cipher?: SessionCipher;
  private channel?: Channel;
  private relay = true;
  private closed = false;
  private mode: ConnectionMode = 'connecting';
  private selected?: Path;
  private directSince = 0;
  private outageSince = Date.now();
  private lastProbe = 0;
  private probeId = 0;
  private relaySince = Date.now();
  private readonly lastPong = { direct: 0, relay: 0 };
  private readonly probes = new Map<number, { path: Path; at: number }>();
  private readonly outgoing = new SendQueue({ capacity: () => this.capacity(),
    send: (part) => this.delivery.enqueue(part) });
  private readonly capacityWaiters = new Set<() => void>();

  constructor(private readonly options: LinkOptions) {
    this.delivery = new ReliableDelivery({
      send: (frame) => this.selected ? this.transmit(this.selected, frame) : false,
      accept: (text) => { const message = this.assembler.accept(text); if (message) options.message(message); },
    });
    if (options.publicKey) this.setKey(options.publicKey);
    this.peer = new HotPeer({ ...options,
      signal: (payload) => this.signal({ type: 'signal', payload }),
      channel: (channel) => this.attach(channel), disconnected: () => this.fallback(),
    });
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  get resumable() { return !this.closed && Boolean(this.cipher); }
  offer() { return this.peer.offer(); }

  private setKey(key: string) {
    if (this.cipher) throw new Error('Session key cannot change');
    this.cipher = new SessionCipher({ ...this.options, publicKey: key });
  }

  async acceptSignal(signal: Signal) {
    if (this.closed) return;
    if (signal.kind === 'key') { this.setKey(signal.key); return; }
    await this.peer.accept(signal);
  }

  private signal(message: object): boolean {
    if (this.closed || !this.relay) return false;
    try { this.options.signal({ ...message, sessionId: this.options.sessionId }); return true; }
    catch { this.setRelayAvailable(false); return false; }
  }

  private attach(channel: Channel) {
    if (this.closed) { channel.close(); return; }
    const previous = this.channel;
    this.channel = channel;
    previous?.close();
    this.lastPong.direct = 0;
    this.directSince = 0;
    channel.onOpen(() => { if (this.channel === channel) this.probe('direct'); });
    channel.onClose(() => { if (this.channel === channel) this.fallback(); });
    channel.onMessage((payload) => { if (this.channel === channel) this.receive(payload, 'direct'); });
    if (channel.readyState === 'open') this.probe('direct');
  }

  private transmit(path: Path, frame: object): boolean {
    if (!this.cipher || this.closed) return false;
    const buffered = path === 'relay' ? this.options.relayBuffered() : this.channel?.bufferedAmount;
    if (buffered === undefined || buffered >= MAX_BUFFER_BYTES) return false;
    if (path === 'direct' && this.channel?.readyState !== 'open') return false;
    if (path === 'relay' && !this.relay) return false;
    const payload = this.cipher.encrypt(JSON.stringify(frame));
    try {
      if (path === 'relay') return this.signal({ type: 'relay', payload });
      this.channel!.send(payload);
      return true;
    } catch { this.lastPong[path] = 0; return false; }
  }

  private probe(path: Path) {
    const id = ++this.probeId;
    this.probes.set(id, { path, at: Date.now() });
    if (!this.transmit(path, { kind: 'ping', id })) this.probes.delete(id);
  }

  receive(payload: string, path: Path = 'relay') {
    if (this.closed || !this.cipher) return;
    try {
      const text = this.cipher.decrypt(payload);
      if (text === null) return;
      const frame = deliveryFrame(text);
      if (frame.kind === 'close') { this.close(false); return; }
      if (frame.kind === 'ping') {
        if (!Number.isSafeInteger(frame.id)) throw new Error('Invalid probe');
        this.transmit(path, { kind: 'pong', id: frame.id });
      } else if (frame.kind === 'pong') this.pong(frame.id, path);
      else {
        this.delivery.accept(frame, (ack) => { this.transmit(path, ack); });
        if (!this.delivery.full) this.releaseCapacity();
      }
    } catch { this.fail('连接校验失败，请重新连接电脑。'); }
  }

  private pong(id: unknown, path: Path) {
    const probe = this.probes.get(Number(id));
    if (!probe || probe.path !== path || Date.now() - probe.at > PATH_TIMEOUT_MS) return;
    this.probes.delete(Number(id));
    if (path === 'direct' && !this.healthy('direct')) this.directSince = Date.now();
    this.lastPong[path] = Date.now();
    this.choose();
  }

  private healthy(path: Path) {
    const open = path === 'relay' ? this.relay : this.channel?.readyState === 'open';
    return Boolean(open && this.lastPong[path] && Date.now() - this.lastPong[path] < PATH_TIMEOUT_MS);
  }

  private choose() {
    if (this.closed) return;
    const direct = this.healthy('direct');
    const relay = this.healthy('relay');
    const stable = Date.now() - this.directSince >= DIRECT_STABLE_MS;
    let path: Path | undefined;
    if (direct && (stable || this.selected === 'direct' || !relay)) path = 'direct';
    else if (relay) path = 'relay';
    const changed = path !== this.selected;
    this.selected = path;
    if (path) this.outageSince = Date.now();
    const mode = path ?? 'connecting';
    if (mode !== this.mode) { this.mode = mode; this.options.mode(mode); }
    if (changed && path) this.delivery.flush(true);
  }

  private tick() {
    if (this.closed) return;
    try {
      const now = Date.now();
      if (now - this.lastProbe >= PROBE_MS) {
        this.lastProbe = now;
        for (const [id, probe] of this.probes) if (now - probe.at >= PATH_TIMEOUT_MS) this.probes.delete(id);
        this.probe('direct');
        this.probe('relay');
      }
      this.choose();
      this.delivery.flush();
      this.peer.recover(this.healthy('direct'), this.relay);
      if (this.relay && now - Math.max(this.relaySince, this.lastPong.relay) > PATH_TIMEOUT_MS) {
        this.setRelayAvailable(false);
        this.options.reconnectRelay?.();
      }
      if (!this.selected && now - this.outageSince > OUTAGE_TIMEOUT_MS) this.fail('连接已中断，请重新连接电脑。');
    } catch { this.fail('连接暂时中断，请重新连接电脑。'); }
  }

  fallback() { this.lastPong.direct = 0; this.directSince = 0; this.choose(); }
  enableRelay() { this.setRelayAvailable(true); }

  setRelayAvailable(available: boolean) {
    if (this.closed) return;
    this.relay = available;
    this.lastPong.relay = 0;
    this.relaySince = Date.now();
    if (available) this.probe('relay');
    this.choose();
  }

  send(message: RpcMessage): Promise<void> {
    return this.outgoing.send(message);
  }

  private async capacity() {
    while (!this.closed && this.delivery.full) {
      await new Promise<void>((resolve) => this.capacityWaiters.add(resolve));
    }
    if (this.closed) throw new Error('电脑已断开连接。');
  }

  private releaseCapacity() {
    for (const resolve of this.capacityWaiters) resolve();
    this.capacityWaiters.clear();
  }

  private fail(message: string) { this.options.error(message); this.close(); }

  close(notify = true) {
    if (this.closed) return;
    if (notify) { this.transmit('direct', { kind: 'close' }); this.transmit('relay', { kind: 'close' }); }
    this.closed = true;
    this.outgoing.close();
    this.releaseCapacity();
    clearInterval(this.timer);
    this.peer.close();
    this.channel?.close();
    this.cipher?.destroy();
    this.delivery.clear();
    this.assembler.clear();
    this.probes.clear();
    this.options.mode('offline');
  }
}
