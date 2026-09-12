import { parseMessage } from './protocol';

const WINDOW_SIZE = 64;
const RETRY_MS = 800;
const DELIVERY_TIMEOUT_MS = 60_000;
const MAX_FRAME_CHARS = 16_000;
interface Pending { text: string; created: number; sent: number }

/** An ordered, bounded stream independent of the path and encryption nonce sequence. */
export class ReliableDelivery {
  private sequence = 0;
  private received = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly incoming = new Map<number, string>();

  constructor(private readonly options: {
    send: (frame: object) => boolean;
    accept: (text: string) => void;
  }) {}

  get full() { return this.pending.size >= WINDOW_SIZE; }

  enqueue(text: string) {
    if (this.full || text.length > MAX_FRAME_CHARS) throw new Error('连接繁忙，请稍后重试。');
    this.pending.set(++this.sequence, { text, created: Date.now(), sent: 0 });
    this.flush();
  }

  accept(frame: Record<string, unknown>, reply: (frame: object) => void) {
    const sequence = frame.sequence;
    if (!Number.isSafeInteger(sequence) || Number(sequence) < 0) throw new Error('Invalid sequence');
    const value = Number(sequence);
    if (frame.kind === 'ack') {
      if (value > this.sequence) throw new Error('Invalid acknowledgement');
      for (const id of this.pending.keys()) if (id <= value) this.pending.delete(id);
      return;
    }
    if (frame.kind !== 'data' || value < 1 || value > this.received + WINDOW_SIZE
      || typeof frame.text !== 'string' || frame.text.length > MAX_FRAME_CHARS) throw new Error('Invalid delivery');
    if (value > this.received && !this.incoming.has(value)) this.incoming.set(value, frame.text);
    while (this.incoming.has(this.received + 1)) {
      const id = this.received + 1;
      this.options.accept(this.incoming.get(id)!);
      this.incoming.delete(id);
      this.received = id;
    }
    reply({ kind: 'ack', sequence: this.received });
  }

  flush(force = false) {
    const now = Date.now();
    for (const [sequence, entry] of this.pending) {
      if (now - entry.created > DELIVERY_TIMEOUT_MS) throw new Error('连接暂时中断，请重新连接。');
      if (!force && entry.sent && now - entry.sent < RETRY_MS) continue;
      if (!this.options.send({ kind: 'data', sequence, text: entry.text })) break;
      entry.sent = now;
    }
  }

  clear() { this.pending.clear(); this.incoming.clear(); }
}

export function deliveryFrame(text: string) { return parseMessage(text); }
