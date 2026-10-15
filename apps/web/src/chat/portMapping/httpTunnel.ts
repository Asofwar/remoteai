import { LINK_CHUNK_BYTES } from '../../../../../shared/terminal/linkChunks';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';
import type { MappingTunnel, MappingTunnelOptions } from '../../../../../shared/port-mapping/types';
import { MappingWebSocket, type MappingSocketEvent } from '../../../../../shared/port-mapping/websocket';
import { decodeBase64, encodeBase64, httpRequest, HttpResponseReader, mappingUrl,
  type MappingHttpRequest, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';

const REQUEST_TIMEOUT_MS = 30_000;

/** A browser mapping owns authenticated remote sockets; it never presents a fake local listener. */
export class WebMappingTunnel implements MappingTunnel {
  private resource = '';
  private origin = '';
  private closed = false;
  private readonly pending = new Set<AbortController>();
  private readonly cancellation = new AbortController();
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
    this.cancellation.abort();
    for (const request of this.pending) request.abort();
    for (const socket of this.sockets) socket.close();
  };

  openWebSocket = async (url: string, protocols: string[], emit: (event: MappingSocketEvent) => void) => {
    const release = this.requireReservation(await this.options.bridgeBudget.acquire(this.cancellation.signal));
    const socket = new MappingWebSocket({ client: this.client, resource: this.resource, origin: this.origin, emit });
    this.sockets.add(socket);
    void socket.run(url, protocols).finally(() => {
      this.sockets.delete(socket); release();
    });
    return socket;
  };

  request = async (input: MappingHttpRequest): Promise<MappingHttpResponse> => {
    const url = mappingUrl(input.url, this.origin).href;
    const release = this.requireReservation(await this.options.bridgeBudget.acquire(this.cancellation.signal));
    const abort = new AbortController();
    this.pending.add(abort);
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try { return await this.exchange({ ...input, url }, abort.signal); }
    finally {
      clearTimeout(timer); this.pending.delete(abort); release();
    }
  };

  private requireReservation(release: (() => void) | undefined) {
    if (this.closed || !release) {
      release?.();
      throw new Error(this.closed ? 'Mapping stopped' : 'Preview busy');
    }
    return release;
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
      for (let offset = 0; offset < request.length; offset += LINK_CHUNK_BYTES) {
        signal.throwIfAborted();
        await this.client.link(this.resource, { type: 'write', id,
          data: encodeBase64(request.subarray(offset, offset + LINK_CHUNK_BYTES)) });
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
