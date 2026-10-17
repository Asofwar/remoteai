import { createGuiFilesClient } from '../remote-chat/files';
import { MappingStreamMux, STREAM_MANIFEST, STREAM_OPERATION, type StreamIdentity,
  type MappingStreamLink } from './streamMux';
import { openRpcMappingSocket, type MappingSocketFactory } from './socket';

export type MappingStreamBridge = (options: { identity: StreamIdentity;
  receive: (bytes: Uint8Array, path: 'direct' | 'relay') => void; failed: () => void }) => Promise<() => void>;

interface StreamSession {
  link: MappingStreamLink; mux: MappingStreamMux; identity: StreamIdentity;
  ready: Promise<() => void>; released: boolean;
}

export class MappingStreamClient {
  private current?: StreamSession;
  constructor(private readonly options: {
    link: () => MappingStreamLink | undefined; supported: () => boolean; random: (length: number) => Uint8Array;
    request: <T>(body: object) => Promise<T>;
    register?: MappingStreamBridge;
  }) {}

  open: MappingSocketFactory = async (resource, url) => {
    const link = this.options.link();
    if (!this.options.supported() || !link?.bulk?.path) {
      return openRpcMappingSocket(createGuiFilesClient(this.options.request), resource, url);
    }
    const session = this.session(link);
    await session.ready.catch(() => session.mux.close());
    if (!this.isCurrent(session)) throw new Error('Mapping connection changed');
    if (session.mux.closed) return this.fallback(session, resource, url);
    const { mux, identity } = session;
    const id = this.uuid();
    const close = () => {
      void this.options.request({ operation: STREAM_OPERATION, action: 'close', resource, id }).catch(() => {
        // Resource/session teardown is the final cleanup when control transport is disconnected.
      });
    };
    const stream = mux.open(id, close);
    try {
      await this.options.request({ operation: STREAM_OPERATION, action: 'open', resource, url, id, ...identity });
      if (stream.closed || !this.isCurrent(session)) throw new Error('Mapping connection closed');
      return stream;
    } catch (error) {
      stream.close();
      // No application bytes have been sent before open returns, so only this failed open can be retried.
      if (mux.closed && this.isCurrent(session)) {
        return this.fallback(session, resource, url);
      }
      throw error;
    }
  };

  private isCurrent(session: StreamSession) {
    return this.current === session && this.options.link() === session.link;
  }

  private session(link: MappingStreamLink) {
    // The host retains its epoch until the authenticated chat link ends. A local receiver failure
    // must not invent another epoch on that link: older hosts reject it forever.
    if (this.current?.link === link) return this.current;
    this.close();
    const identity = { transferId: this.uuid(), epoch: this.uuid() };
    const cipher = link.createBulkCipher({ ...identity, manifestId: STREAM_MANIFEST });
    const mux = new MappingStreamMux({ transport: link.bulk!, cipher, identity });
    const ready = this.options.register?.({ identity, receive: (bytes, path) => link.bulk?.receive(bytes, path),
      failed: () => mux.close() })
      ?? Promise.resolve(() => {});
    void ready.catch(() => mux.close());
    this.current = { link, mux, identity, ready, released: false };
    return this.current;
  }

  private fallback(session: StreamSession, resource: string, url: string) {
    this.release(session);
    return openRpcMappingSocket(createGuiFilesClient(this.options.request), resource, url);
  }

  private release(session: StreamSession) {
    if (session.released) return;
    session.released = true;
    void session.ready.then(release => release()).catch(() => {
      // A failed registration has no native receiver to release.
    });
  }
  private uuid() {
    const bytes = this.options.random(16);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  close() {
    this.current?.mux.close();
    if (this.current) this.release(this.current);
    this.current = undefined;
  }
}
