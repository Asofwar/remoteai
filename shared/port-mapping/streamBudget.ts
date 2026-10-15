const MAX_ACTIVE_STREAMS = 8;
const MAX_WAITING_STREAMS = 128;
const WAIT_TIMEOUT_MS = 30_000;
type Release = () => void;

/** FIFO admission shared by one computer's mappings, leaving RPC capacity for chat and stream cleanup. */
export class StreamBudget {
  private used = 0;
  private readonly waiting = new Set<(available: boolean) => void>();

  constructor(readonly limit = MAX_ACTIVE_STREAMS) {}

  get active() { return this.used; }

  acquire(signal: AbortSignal): Promise<Release | undefined> {
    if (signal.aborted) return Promise.resolve(undefined);
    if (this.used < this.limit) return Promise.resolve(this.reserve());
    if (this.waiting.size >= MAX_WAITING_STREAMS) return Promise.resolve(undefined);
    return new Promise(resolve => {
      const finish = (available: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        this.waiting.delete(finish);
        resolve(available ? this.reserve() : undefined);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, WAIT_TIMEOUT_MS);
      this.waiting.add(finish);
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  private reserve(): Release {
    this.used++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used--;
      this.waiting.values().next().value?.(true);
    };
  }
}
