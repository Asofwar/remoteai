import { MAX_HTTP_BYTES, type MappingHttpResponse } from '../../../../../shared/port-mapping/http';

/** Bound decoded bytes as well as wire bytes; compressed responses must not bypass the preview limit. */
export async function decompressResponse(response: MappingHttpResponse, signal: AbortSignal) {
  const headers = new Headers(response.headers);
  const encoding = headers.get('content-encoding')?.trim().toLowerCase();
  if (!encoding || encoding === 'identity' || response.body.length === 0) return response;
  if (!['gzip', 'deflate'].includes(encoding) || typeof DecompressionStream === 'undefined') {
    throw new Error('Unsupported response compression');
  }
  const source = new Blob([response.body]).stream();
  const reader = source.pipeThrough(new DecompressionStream(encoding as CompressionFormat)).getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > MAX_HTTP_BYTES) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  headers.delete('content-encoding'); headers.delete('transfer-encoding');
  headers.set('content-length', String(size));
  return { ...response, body, headers: [...headers.entries()] };
}
