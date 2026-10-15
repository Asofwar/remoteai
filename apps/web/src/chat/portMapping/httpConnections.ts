import type { MappingSocket } from '../../../../../shared/port-mapping/socket';
import type { StreamBudget } from '../../../../../shared/port-mapping/streamBudget';

const IDLE_MS = 4000;
const MAX_IDLE = 8;
interface Idle { owner: object; socket: MappingSocket; timer: ReturnType<typeof setTimeout> }
const pools = new WeakMap<StreamBudget, HttpConnections>();

/** Idle connections share a device-wide bound, independently of the active request admission queue. */
export function httpConnections(budget: StreamBudget) {
  let pool = pools.get(budget);
  if (!pool) { pool = new HttpConnections(); pools.set(budget, pool); }
  return pool;
}

class HttpConnections {
  private readonly idle = new Set<Idle>();
  take(owner: object) {
    const entry = [...this.idle].reverse().find(value => value.owner === owner);
    if (!entry) return;
    this.idle.delete(entry); clearTimeout(entry.timer);
    return entry.socket;
  }
  put(owner: object, socket: MappingSocket) {
    if (this.idle.size >= MAX_IDLE) this.remove(this.idle.values().next().value!);
    const entry: Idle = { owner, socket, timer: setTimeout(() => this.remove(entry), IDLE_MS) };
    this.idle.add(entry);
  }
  clear(owner: object) {
    for (const entry of this.idle) if (entry.owner === owner) this.remove(entry);
  }
  private remove(entry: Idle) {
    this.idle.delete(entry); clearTimeout(entry.timer); entry.socket.close();
  }
}
