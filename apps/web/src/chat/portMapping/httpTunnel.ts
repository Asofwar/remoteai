import { openMappingSocket, type MappingSocket } from '../../../../../shared/port-mapping/socket';
import type { ForwardingClient } from '../../../../../shared/port-mapping/service';
import type { MappingTunnel, MappingTunnelOptions } from '../../../../../shared/port-mapping/types';
import { MappingWebSocket, type MappingSocketEvent } from '../../../../../shared/port-mapping/websocket';
import { httpRequest, HttpResponseReader, mappingUrl,
  type MappingHttpRequest, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';
import { httpConnections } from './httpConnections';
import { decompressResponse } from './httpCompression';

const REQUEST_TIMEOUT_MS = 30_000;

/** A browser mapping owns authenticated remote sockets; it never presents a fake local listener. */
export class WebMappingTunnel implements MappingTunnel {
  private resource = '';
  private origin = '';
  private closed = false;
  private readonly pending = new Set<AbortController>();
  private readonly cancellation = new AbortController();
  private readonly sockets = new Set<MappingWebSocket>();
  private readonly connections;

  constructor(private readonly client: ForwardingClient, private readonly options: MappingTunnelOptions) {
    this.connections = httpConnections(options.bridgeBudget);
  }

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
    this.connections.clear(this);
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

  request = async (input: MappingHttpRequest, cancelled?: AbortSignal): Promise<MappingHttpResponse> => {
    const url = mappingUrl(input.url, this.origin).href;
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, this.cancellation.signal, ...(cancelled ? [cancelled] : [])]);
    this.pending.add(abort);
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let release: (() => void) | undefined;
    try {
      release = this.requireReservation(await this.options.bridgeBudget.acquire(signal));
      return await this.exchange({ ...input, url }, signal);
    }
    finally {
      clearTimeout(timer); this.pending.delete(abort); release?.();
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
    const reused = this.connections.take(this);
    try { return await this.perform(input, signal, reused); }
    catch (error) {
      // A server may close an idle connection. Never replay POSTs or a partially received response.
      if (!(error instanceof IdleConnectionClosed) || !reused || !['GET', 'HEAD'].includes(input.method ?? 'GET')) {
        throw error;
      }
      signal.throwIfAborted();
      return this.perform(input, signal);
    }
  }

  private async perform(input: MappingHttpRequest, signal: AbortSignal, reused?: MappingSocket) {
    const request = httpRequest(input, this.origin,
      { keepAlive: true, compression: typeof DecompressionStream !== 'undefined' });
    const socket = reused ?? await openMappingSocket(this.client, this.resource, this.origin, signal);
    const close = () => socket.close();
    const reader = new HttpResponseReader(input.method);
    signal.addEventListener('abort', close, { once: true });
    let reusable = false;
    try {
      signal.throwIfAborted();
      await socket.write(request);
      const response = await this.read({ socket, reader, input, signal });
      const decoded = await decompressResponse(response, signal);
      reusable = reader.reusable && !this.closed && !signal.aborted;
      return decoded;
    } catch (error) {
      if (reused && !reader.receivedBytes && !signal.aborted) throw new IdleConnectionClosed();
      throw error;
    } finally {
      signal.removeEventListener('abort', close);
      if (reusable) this.connections.put(this, socket); else close();
    }
  }

  private async read({ socket, reader, input, signal }: {
    socket: MappingSocket; reader: HttpResponseReader; input: MappingHttpRequest; signal: AbortSignal;
  }) {
    for (;;) {
      signal.throwIfAborted();
      const reply = await socket.read();
      signal.throwIfAborted();
      const result = reader.push(reply.data, reply.eof);
      if (result) return { ...result, url: input.url };
    }
  }
}

class IdleConnectionClosed extends Error {
  constructor() { super('Idle connection closed'); }
}
