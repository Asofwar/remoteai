import { MappingStreamMux, STREAM_MANIFEST, STREAM_OPERATION, type StreamIdentity,
  type MappingStreamLink } from './streamMux';
import type { MappingSocketFactory } from './socket';
import { MAPPING_RECONNECT_REQUIRED, MAPPING_UPDATE_REQUIRED } from './errors';

export type MappingStreamBridge = (options: { identity: StreamIdentity;
  receiverKey: Uint8Array; authenticated: (id: string, bytes: Uint8Array) => void;
  failed: () => void }) => Promise<() => void>;

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
    if (!this.options.supported()) throw new Error(MAPPING_UPDATE_REQUIRED);
    if (!link?.bulk?.path) throw new Error(MAPPING_RECONNECT_REQUIRED);
    const session = this.session(link);
    await session.ready.catch(() => session.mux.close());
    if (!this.isCurrent(session)) throw new Error('Mapping connection changed');
    if (session.mux.closed) { this.release(session); throw new Error(MAPPING_RECONNECT_REQUIRED); }
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
      if (mux.closed) this.release(session);
      throw error;
    }
  };

  private isCurrent(session: StreamSession) {
    return this.current === session && this.options.link() === session.link;
  }

  private session(link: MappingStreamLink) {
    // An epoch and nonce space live for the complete authenticated link. After receiver failure,
    // reconnect instead of reusing keys or silently switching to request/response forwarding.
    if (this.current?.link === link) return this.current;
    this.close();
    const identity = { transferId: this.uuid(), epoch: this.uuid() };
    const cipher = link.createBulkCipher({ ...identity, manifestId: STREAM_MANIFEST });
    const mux = new MappingStreamMux({ transport: link.bulk!, cipher, identity });
    const ready = this.register({ mux, identity, receiverKey: cipher.receiverMaterial().key });
    void ready.catch(() => mux.close());
    this.current = { link, mux, identity, ready, released: false };
    return this.current;
  }

  private async register({ mux, identity, receiverKey }: {
    mux: MappingStreamMux; identity: StreamIdentity; receiverKey: Uint8Array;
  }) {
    try {
      return await this.options.register?.({ identity, receiverKey,
        authenticated: (id, bytes) => mux.receiveAuthenticated(id, bytes),
        failed: () => mux.close() }) ?? (() => {});
    } finally { receiverKey.fill(0); }
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
