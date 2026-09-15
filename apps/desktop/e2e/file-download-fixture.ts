import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { downloadFile, type FileClient, type FileRequest } from '../../../shared/remote-chat/fileDownload';
import type { ChatRpc } from '../../../shared/remote-chat/rpc';

const sizes: Record<string, number> = {
  'large.apk': 21 * 1024 * 1024 + 17, 'lan-100mb.bin': 100 * 1024 * 1024 + 17,
  'small.zip': 1024 * 1024 + 3, 'empty': 0,
};
const handles = new Map<string, number>();
export function fileDownloadResponse(body: unknown): unknown {
  const request = body as FileRequest;
  if (request.operation === 'fileOpen') {
    const size = sizes[request.path];
    if (size === undefined) throw new Error('Missing fixture');
    const id = crypto.randomUUID(); handles.set(id, size);
    return { id, size, name: request.path, mimeType: 'application/octet-stream' };
  }
  if (request.operation === 'fileRead') {
    if (!handles.has(request.id)) throw new Error('Closed fixture');
    const bytes = Array.from({ length: request.length }, (_, index) => String.fromCharCode((request.offset + index) % 251));
    return { offset: request.offset, data: btoa(bytes.join('')) };
  }
  if (request.operation === 'fileClose') { handles.delete(request.id); return null; }
  return body;
}
export async function downloadFixture(rpc: Pick<ChatRpc, 'request'>, path: string) {
  const hash = sha256.create();
  let size = 0;
  const client: FileClient = {
    open: (threadId, source) => rpc.request('request', { operation: 'fileOpen', threadId, path: source }),
    read: (request) => rpc.request('request', { operation: 'fileRead', ...request }),
    close: (threadId, id) => rpc.request('request', { operation: 'fileClose', threadId, id }),
  };
  await downloadFile({ client, path, threadId: 'test', signal: new AbortController().signal,
    progress: (received) => { size = received; }, target: async () => ({
      write: async (data) => { hash.update(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))); },
      finish: async () => undefined, dispose: async () => undefined,
    }) });
  return { size, hash: bytesToHex(hash.digest()) };
}
