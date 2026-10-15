import type { ForwardingClient } from './service';
import { decodeBase64, encodeBase64 } from './http';
import { LINK_CHUNK_BYTES } from '../terminal/linkChunks';

export interface MappingRead { data: Uint8Array; eof: boolean }
export interface MappingSocket {
  read(): Promise<MappingRead>;
  write(bytes: Uint8Array): Promise<void>;
  close(): void;
}
export type MappingSocketFactory = (resource: string, url: string) => Promise<MappingSocket>;

/** The fallback preserves the authenticated resource scope on peers without streaming support. */
export async function openMappingSocket(client: ForwardingClient, resource: string, url: string,
  signal?: AbortSignal): Promise<MappingSocket> {
  signal?.throwIfAborted();
  const opened = client.stream ? client.stream(resource, url) : openRpcMappingSocket(client, resource, url);
  if (!signal) return opened;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Mapping request cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    void opened.then(socket => {
      if (signal.aborted) { socket.close(); abort(); } else resolve(socket);
    }, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

export async function openRpcMappingSocket(client: ForwardingClient, resource: string,
  url: string): Promise<MappingSocket> {
  const opened = await client.link(resource, { type: 'connect', url });
  if (opened.type !== 'socket') throw new Error('Unexpected socket response');
  const id = opened.id;
  let closed = false;
  return {
    read: async () => {
      if (closed) throw new Error('Socket closed');
      const reply = await client.link(resource, { type: 'read', id });
      if (reply.type !== 'data') throw new Error('Unexpected read response');
      return { data: decodeBase64(reply.data), eof: reply.eof };
    },
    write: async bytes => {
      for (let offset = 0; offset < bytes.length; offset += LINK_CHUNK_BYTES) {
        if (closed) throw new Error('Socket closed');
        await client.link(resource, { type: 'write', id,
          data: encodeBase64(bytes.subarray(offset, offset + LINK_CHUNK_BYTES)) });
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      void client.link(resource, { type: 'close', id }).catch(() => {
        // Closing the owning resource also releases sockets after a disconnected request.
      });
    },
  };
}
