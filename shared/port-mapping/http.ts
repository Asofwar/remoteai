export interface MappingHttpRequest { url: string; method?: string; headers?: [string, string][]; body?: Uint8Array }
export interface MappingHttpResponse { status: number; headers: [string, string][]; body: Uint8Array; url: string }
const MAX_HEADER_BYTES = 64 * 1024;
const BROWSER_HEADERS = new RegExp(
  '^(host|connection|content-length|transfer-encoding|accept-encoding|cookie|origin|referer|upgrade|sec-)', 'i');
export const MAX_HTTP_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
export function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left); result.set(right, left.length);
  return result;
}

/** Preview requests stay on the selected IP and port; localhost is an alias only for IPv4 loopback. */
export function mappingUrl(value: string, origin: string): URL {
  const url = new URL(value, origin);
  const target = new URL(origin);
  if (url.hostname === 'localhost' && target.hostname === '127.0.0.1') url.hostname = '127.0.0.1';
  if (url.origin !== target.origin || url.username || url.password) throw new Error('Preview origin rejected');
  return url;
}

export function httpRequest(input: MappingHttpRequest, origin: string): Uint8Array {
  const url = mappingUrl(input.url, origin);
  const method = (input.method ?? 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method) || ['CONNECT', 'TRACE', 'TRACK'].includes(method)) throw new Error('Invalid method');
  const headers = (input.headers ?? []).filter(([name, value]) => {
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || /[\r\n\0]/.test(value)) throw new Error('Invalid header');
    return !BROWSER_HEADERS.test(name);
  });
  const body = input.body ?? new Uint8Array();
  if (body.length > MAX_HTTP_BYTES) throw new Error('Request too large');
  const lines = [`${method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`,
    'Connection: close', 'Accept-Encoding: identity', ...headers.map(([name, value]) => `${name}: ${value}`)];
  if (body.length || !['GET', 'HEAD'].includes(method)) lines.push(`Content-Length: ${body.length}`);
  return concatBytes(encoder.encode(lines.join('\r\n') + '\r\n\r\n'), body);
}

/** Incremental HTTP/1 parser handles split headers, content length, chunking and close-delimited replies. */
export class HttpResponseReader {
  private bytes: Uint8Array = new Uint8Array();
  private head?: { status: number; headers: [string, string][] };
  private received = 0;
  constructor(private readonly method = 'GET') {}

  push(bytes: Uint8Array, eof: boolean): Omit<MappingHttpResponse, 'url'> | undefined {
    this.received += bytes.length;
    if (this.received > MAX_HTTP_BYTES) throw new Error('Response too large');
    this.bytes = concatBytes(this.bytes, bytes);
    if (!this.head && !this.readHeaders()) {
      if (eof) throw new Error('Truncated headers');
      return;
    }
    const head = this.head!;
    if (this.method === 'HEAD' || [204, 304].includes(head.status)) return { ...head, body: new Uint8Array() };
    const fields = new Headers(head.headers);
    if (/\bchunked\b/i.test(fields.get('transfer-encoding') ?? '')) {
      const body = readChunks(this.bytes);
      if (body) return { ...head, body };
    } else {
      const length = fields.get('content-length');
      if (length !== null) {
        if (!/^\d+$/.test(length) || Number(length) > MAX_HTTP_BYTES) throw new Error('Invalid response length');
        if (this.bytes.length >= Number(length)) return { ...head, body: this.bytes.slice(0, Number(length)) };
      } else if (eof) return { ...head, body: this.bytes };
    }
    if (eof) throw new Error('Truncated response');
  }

  private readHeaders(): boolean {
    const boundary = findCrlf(this.bytes, 0, true);
    if (boundary < 0) {
      if (this.bytes.length > MAX_HEADER_BYTES) throw new Error('Headers too large');
      return false;
    }
    if (boundary > MAX_HEADER_BYTES) throw new Error('Headers too large');
    const [statusLine, ...lines] = decoder.decode(this.bytes.subarray(0, boundary)).split('\r\n');
    const status = Number(/^HTTP\/1\.[01] (\d{3})\b/.exec(statusLine)?.[1]);
    if (status < 100 || status > 599 || !status) throw new Error('Invalid HTTP response');
    this.bytes = this.bytes.slice(boundary + 4);
    if (status < 200) {
      if (status === 101) throw new Error('Unexpected protocol upgrade');
      return this.readHeaders();
    }
    const headers = lines.map((line): [string, string] => {
      const split = line.indexOf(':');
      if (split <= 0) throw new Error('Invalid HTTP header');
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    });
    this.head = { status, headers };
    return true;
  }
}

function findCrlf(bytes: Uint8Array, start: number, double = false) {
  for (let index = start; index < bytes.length - (double ? 3 : 1); index++) {
    if (bytes[index] === 13 && bytes[index + 1] === 10
      && (!double || bytes[index + 2] === 13 && bytes[index + 3] === 10)) return index;
  }
  return -1;
}

function readChunks(bytes: Uint8Array): Uint8Array | undefined {
  let offset = 0;
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (offset < bytes.length) {
    const end = findCrlf(bytes, offset);
    if (end < 0) return;
    const field = decoder.decode(bytes.subarray(offset, end)).split(';')[0];
    if (!/^[\da-f]+$/i.test(field)) throw new Error('Invalid chunk');
    const size = Number.parseInt(field, 16);
    if (size > MAX_HTTP_BYTES) throw new Error('Chunk too large');
    offset = end + 2;
    if (!size) return bytes.length >= offset + 2 ? joinChunks(chunks, length) : undefined;
    if (bytes.length < offset + size + 2) return;
    if (bytes[offset + size] !== 13 || bytes[offset + size + 1] !== 10) throw new Error('Invalid chunk boundary');
    chunks.push(bytes.subarray(offset, offset + size)); length += size;
    offset += size + 2;
  }
}

function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
