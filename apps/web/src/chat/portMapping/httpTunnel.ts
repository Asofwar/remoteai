import type { ForwardingClient } from '../../../../../shared/port-mapping/service';
import type { MappingTunnel, MappingTunnelOptions } from '../../../../../shared/port-mapping/types';
import { MappingWebSocket, type MappingSocketEvent } from '../../../../../shared/port-mapping/websocket';
import { decodeBase64, encodeBase64, httpRequest, HttpResponseReader, mappingUrl,
  type MappingHttpRequest, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';

const REQUEST_TIMEOUT_MS = 30_000;
const WRITE_CHUNK_BYTES = 48 * 1024;
const MAX_WAITING_REQUESTS = 128;

/** A browser mapping owns authenticated remote sockets; it never presents a fake local listener. */
export class WebMappingTunnel implements MappingTunnel {
  private resource = '';
  private origin = '';
  private closed = false;
  private readonly pending = new Set<AbortController>();
  private readonly waiting = new Set<() => void>();
  private readonly sockets = new Set<MappingWebSocket>();

  constructor(private readonly client: ForwardingClient, private readonly options: MappingTunnelOptions) {}

  resolve = async (resource: string, url: string) => {
    this.resource = resource; this.origin = url;
    const probe = await this.client.link(resource, { type: 'connect', url });
    if (probe.type !== 'socket') throw new Error('Unexpected socket response');
    await this.client.link(resource, { type: 'close', id: probe.id });
    if (this.closed) throw new Error('Mapping stopped');
    return url;
  };

  close = async () => {
    this.closed = true;
    for (const request of this.pending) request.abort();
    for (const wake of this.waiting) wake();
    for (const socket of this.sockets) socket.close();
  };

  openWebSocket = async (url: string, protocols: string[], emit: (event: MappingSocketEvent) => void) => {
    await this.acquire();
    const socket = new MappingWebSocket({ client: this.client, resource: this.resource, origin: this.origin, emit });
    this.sockets.add(socket);
    void socket.run(url, protocols).finally(() => {
      this.sockets.delete(socket); this.options.bridgeBudget.active--;
      this.waiting.values().next().value?.();
    });
    return socket;
  };

  request = async (input: MappingHttpRequest): Promise<MappingHttpResponse> => {
    const url = mappingUrl(input.url, this.origin).href;
    await this.acquire();
    const abort = new AbortController();
    this.pending.add(abort);
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try { return await this.exchange({ ...input, url }, abort.signal); }
    finally {
      clearTimeout(timer); this.pending.delete(abort); this.options.bridgeBudget.active--;
      // The budget is shared by mappings. Other mappings retry their queue on a short timer.
      this.waiting.values().next().value?.();
    }
  };

  private async acquire() {
    if (this.waiting.size >= MAX_WAITING_REQUESTS) throw new Error('Too many requests');
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    while (!this.closed && this.options.bridgeBudget.active >= this.options.bridgeBudget.limit) {
      if (Date.now() >= deadline) throw new Error('Preview busy');
      await new Promise<void>(resolve => {
        const wake = () => { clearTimeout(timer); this.waiting.delete(wake); resolve(); };
        const timer = setTimeout(wake, 100);
        this.waiting.add(wake);
      });
    }
    if (this.closed) throw new Error('Mapping stopped');
    this.options.bridgeBudget.active++;
  }

  private async exchange(input: MappingHttpRequest, signal: AbortSignal): Promise<MappingHttpResponse> {
    const request = httpRequest(input, this.origin);
    let id: string | undefined;
    const close = () => {
      if (id) void this.client.link(this.resource, { type: 'close', id }).catch(() => {
        // Releasing the mapping's resource also releases disconnected sockets.
      });
    };
    signal.addEventListener('abort', close, { once: true });
    try {
      const opened = await this.client.link(this.resource, { type: 'connect', url: this.origin });
      if (opened.type !== 'socket') throw new Error('Unexpected socket response');
      id = opened.id;
      signal.throwIfAborted();
      for (let offset = 0; offset < request.length; offset += WRITE_CHUNK_BYTES) {
        signal.throwIfAborted();
        await this.client.link(this.resource, { type: 'write', id,
          data: encodeBase64(request.subarray(offset, offset + WRITE_CHUNK_BYTES)) });
      }
      return await this.read({ id, input, signal });
    } finally { signal.removeEventListener('abort', close); close(); }
  }

  private async read({ id, input, signal }: { id: string; input: MappingHttpRequest; signal: AbortSignal }) {
    const reader = new HttpResponseReader(input.method);
    for (;;) {
      signal.throwIfAborted();
      const reply = await this.client.link(this.resource, { type: 'read', id });
      signal.throwIfAborted();
      if (reply.type !== 'data') throw new Error('Unexpected read response');
      const result = reader.push(decodeBase64(reply.data), reply.eof);
      if (result) return { ...result, url: input.url };
    }
  }
}
