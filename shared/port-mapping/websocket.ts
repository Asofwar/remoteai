import { LINK_CHUNK_BYTES } from '../terminal/linkChunks';
import { concatBytes, decodeBase64, encodeBase64, mappingUrl } from './http';
import type { ForwardingClient } from './service';

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const HEADER_LIMIT = 16 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export type MappingSocketEvent = { type: 'open'; protocol: string }
  | { type: 'message'; data: string | Uint8Array }
  | { type: 'close'; code: number; wasClean: boolean } | { type: 'error' };

export function encodeFrame(opcode: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_FRAME_BYTES) throw new Error('Frame too large');
  const extra = payload.length < 126 ? 0 : payload.length <= 65535 ? 2 : 8;
  const result = new Uint8Array(2 + extra + 4 + payload.length);
  result[0] = 0x80 | opcode;
  result[1] = 0x80 | (extra === 0 ? payload.length : extra === 2 ? 126 : 127);
  const view = new DataView(result.buffer);
  if (extra === 2) view.setUint16(2, payload.length);
  if (extra === 8) view.setUint32(6, payload.length);
  const mask = crypto.getRandomValues(new Uint8Array(4));
  result.set(mask, 2 + extra);
  for (let index = 0; index < payload.length; index++) result[6 + extra + index] = payload[index] ^ mask[index % 4];
  return result;
}

export class WebSocketFrames {
  private bytes: Uint8Array = new Uint8Array();
  private fragments: Uint8Array = new Uint8Array();
  private opcode = 0;
  push(input: Uint8Array): { opcode: number; data: Uint8Array }[] {
    this.bytes = concatBytes(this.bytes, input);
    const output: { opcode: number; data: Uint8Array }[] = [];
    for (;;) {
      const frame = this.next();
      if (!frame) return output;
      if (frame.opcode >= 8) { output.push({ opcode: frame.opcode, data: frame.data }); continue; }
      if (frame.opcode) {
        if (this.opcode || ![1, 2].includes(frame.opcode)) throw new Error('Invalid continuation');
        this.opcode = frame.opcode;
      } else if (!this.opcode) throw new Error('Missing continuation');
      this.fragments = concatBytes(this.fragments, frame.data);
      if (this.fragments.length > MAX_FRAME_BYTES) throw new Error('Message too large');
      if (frame.final) {
        output.push({ opcode: this.opcode, data: this.fragments });
        this.fragments = new Uint8Array(); this.opcode = 0;
      }
    }
  }

  private next() {
    const bytes = this.bytes;
    if (bytes.length < 2) return;
    if (bytes[0] & 0x70 || bytes[1] & 0x80) throw new Error('Invalid server frame');
    const indicator = bytes[1] & 0x7f;
    const header = indicator < 126 ? 2 : indicator === 126 ? 4 : 10;
    if (bytes.length < header) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (header === 10 && view.getUint32(2)) throw new Error('Frame too large');
    const size = header === 2 ? indicator : header === 4 ? view.getUint16(2) : view.getUint32(6);
    if (size > MAX_FRAME_BYTES) throw new Error('Frame too large');
    const opcode = bytes[0] & 0xf;
    if (![0, 1, 2, 8, 9, 10].includes(opcode)) throw new Error('Invalid opcode');
    const final = Boolean(bytes[0] & 0x80);
    if (opcode >= 8 && (!final || size > 125)) throw new Error('Invalid control frame');
    if (bytes.length < header + size) return;
    const data = bytes.slice(header, header + size);
    this.bytes = bytes.slice(header + size);
    return { opcode, final, data };
  }
}

export class MappingWebSocket {
  private id?: string;
  private closed = false;
  private writes = Promise.resolve();
  private queued = 0;
  private resolveStopped!: () => void;
  private readonly stopped = new Promise<void>(resolve => { this.resolveStopped = resolve; });
  constructor(private readonly options: {
    client: ForwardingClient; resource: string; origin: string; emit: (event: MappingSocketEvent) => void;
  }) {}

  async run(value: string, protocols: string[]) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'ws:') throw new Error('Unsupported socket protocol');
      url.protocol = 'http:';
      mappingUrl(url.href, this.options.origin);
      if (protocols.some(protocol => !/^[!#$%&'*+.^_`|~\w-]+$/.test(protocol))) throw new Error('Invalid protocol');
      const opened = await this.options.client.link(this.options.resource, { type: 'connect', url: this.options.origin });
      if (opened.type !== 'socket') throw new Error('Unexpected socket response');
      this.id = opened.id;
      if (this.closed) { this.release(); return; }
      await Promise.race([this.handshake(url, protocols).then(leftover => this.readFrames(leftover)), this.stopped]);
    } catch { this.fail(); }
    finally { this.close(); }
  }

  send(data: string | Uint8Array) {
    return this.write(encodeFrame(typeof data === 'string' ? 1 : 2, typeof data === 'string' ? encoder.encode(data) : data));
  }
  close(wasClean = true) {
    if (this.closed) return;
    this.closed = true;
    this.release();
    this.resolveStopped();
    this.options.emit({ type: 'close', code: wasClean ? 1000 : 1006, wasClean });
  }
  private fail() {
    if (this.closed) return;
    this.options.emit({ type: 'error' });
    this.close(false);
  }
  private release() {
    const id = this.id;
    this.id = undefined;
    if (id) void this.options.client.link(this.options.resource, { type: 'close', id }).catch(() => {
      // The owning resource provides final cleanup after a disconnected RPC.
    });
  }
  private write(bytes: Uint8Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Socket closed'));
    if (this.queued + bytes.length > MAX_FRAME_BYTES) {
      this.fail(); return Promise.reject(new Error('Socket queue full'));
    }
    this.queued += bytes.length;
    this.writes = this.writes.then(async () => {
      for (let offset = 0; offset < bytes.length; offset += LINK_CHUNK_BYTES) {
        if (this.closed || !this.id) throw new Error('Socket closed');
        await this.options.client.link(this.options.resource, { type: 'write', id: this.id,
          data: encodeBase64(bytes.subarray(offset, offset + LINK_CHUNK_BYTES)) });
      }
    }).catch(error => {
      // A partial write cannot be safely replayed. End the socket even if reads remain healthy.
      this.fail(); throw error;
    }).finally(() => { this.queued -= bytes.length; });
    return this.writes;
  }

  private async handshake(url: URL, protocols: string[]): Promise<Uint8Array> {
    const key = encodeBase64(crypto.getRandomValues(new Uint8Array(16)));
    await this.write(encoder.encode([`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`,
      'Connection: Upgrade', 'Upgrade: websocket', `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
      ...(protocols.length ? [`Sec-WebSocket-Protocol: ${protocols.join(', ')}`] : []), '', ''].join('\r\n')));
    let bytes: Uint8Array = new Uint8Array();
    for (;;) {
      const reply = await this.options.client.link(this.options.resource, { type: 'read', id: this.id! });
      if (this.closed || reply.type !== 'data' || reply.eof) throw new Error('Socket closed');
      bytes = concatBytes(bytes, decodeBase64(reply.data));
      const text = decoder.decode(bytes);
      const end = text.indexOf('\r\n\r\n');
      if (end < 0) { if (bytes.length > HEADER_LIMIT) throw new Error('Headers too large'); continue; }
      const expected = encodeBase64(new Uint8Array(await crypto.subtle.digest('SHA-1', encoder.encode(key + GUID))));
      if (this.closed) throw new Error('Socket closed');
      const accept = /^sec-websocket-accept:\s*(.*?)\s*$/im.exec(text.slice(0, end))?.[1];
      if (!/^HTTP\/1\.[01] 101\b/.test(text) || accept !== expected) throw new Error('Invalid upgrade');
      const protocol = /^sec-websocket-protocol:\s*(.*?)\s*$/im.exec(text.slice(0, end))?.[1] ?? '';
      if (protocol && !protocols.includes(protocol)) throw new Error('Invalid selected protocol');
      this.options.emit({ type: 'open', protocol });
      return bytes.slice(end + 4);
    }
  }

  private async readFrames(initial: Uint8Array) {
    const parser = new WebSocketFrames();
    let bytes = initial;
    while (!this.closed) {
      for (const frame of parser.push(bytes)) {
        if (this.closed) return;
        if (frame.opcode === 8) return;
        if (frame.opcode === 9) await this.write(encodeFrame(10, frame.data));
        if (frame.opcode === 1 || frame.opcode === 2) {
          this.options.emit({ type: 'message', data: frame.opcode === 1 ? decoder.decode(frame.data) : frame.data });
        }
      }
      if (this.closed) return;
      const reply = await this.options.client.link(this.options.resource, { type: 'read', id: this.id! });
      if (reply.type !== 'data' || reply.eof) return;
      bytes = decodeBase64(reply.data);
    }
  }
}
