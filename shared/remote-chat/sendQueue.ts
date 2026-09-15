import { chunks } from './framing';
import type { ConnectionMode, RpcMessage } from './protocol';

const MAX_QUEUED_MESSAGES = 512;
// The receiver allows eight partial assemblies. Reserve one for ordered events/requests.
const INTERLEAVED_RESPONSES = 4;
const UI_WORK_SLICE_MS = 8;
interface Pending {
  parts: Generator<string>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Share available capacity without letting an old history response block new replies. */
export class SendQueue {
  private readonly ordered: Pending[] = [];
  private readonly responses: Pending[] = [];
  private serial = 0;
  private running = false;
  private closed = false;

  constructor(private readonly transport: {
    capacity: () => Promise<void>; send: (part: string) => void; mode?: () => ConnectionMode;
  }) {}

  send(message: RpcMessage): Promise<void> {
    if (this.closed) return Promise.reject(new Error('电脑已断开连接。'));
    if (this.ordered.length + this.responses.length >= MAX_QUEUED_MESSAGES) {
      return Promise.reject(new Error('连接繁忙，请稍后重试。'));
    }
    const result = new Promise<void>((resolve, reject) => {
      const queue = message.kind === 'response' ? this.responses : this.ordered;
      queue.push({ parts: chunks(message, String(++this.serial), this.transport.mode?.()), resolve, reject });
    });
    if (!this.running) void this.drain();
    return result;
  }

  private async drain() {
    this.running = true;
    let started = performance.now();
    try {
      while (!this.closed && (this.ordered.length || this.responses.length)) {
        await this.transport.capacity();
        if (this.closed) break;
        this.sendNext();
        // Yield only after actual CPU work, never impose a delay on every fragment.
        if (performance.now() - started >= UI_WORK_SLICE_MS) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
        }
      }
    } catch (error) {
      this.rejectPending(error);
    } finally { this.running = false; }
  }

  private sendNext() {
    const queue = this.ordered.length ? this.ordered : this.responses;
    const pending = queue[0];
    try {
      const part = pending.parts.next();
      if (part.done) { queue.shift(); pending.resolve(); return; }
      this.transport.send(part.value);
      if (queue === this.responses) {
        queue.shift();
        queue.splice(Math.min(INTERLEAVED_RESPONSES - 1, queue.length), 0, pending);
      }
    } catch (error) { queue.shift(); pending.reject(error); }
  }

  private rejectPending(error: unknown) {
    for (const pending of [...this.ordered.splice(0), ...this.responses.splice(0)]) pending.reject(error);
  }

  close() {
    this.closed = true;
    this.rejectPending(new Error('电脑已断开连接。'));
  }
}
