import { base64Bytes, checkDownloadSize } from './policy';

export const FILE_CHUNK_BYTES = 256 * 1024;
export interface FileInfo { id: string; size: number; name: string; mimeType: string }
export interface FileRead { threadId: string; id: string; offset: number; length: number }
export interface FileChunk { offset: number; data: string }
export type FileRequest =
  | { operation: 'fileOpen'; threadId: string; path: string; maxBytes?: number }
  | ({ operation: 'fileRead'; maxBytes?: number } & FileRead)
  | { operation: 'fileClose'; threadId: string; id: string };
export interface FileClient {
  open: (threadId: string, path: string) => Promise<FileInfo>;
  read: (request: FileRead) => Promise<FileChunk>;
  close: (threadId: string, id: string) => Promise<unknown>;
}
export interface DownloadTarget {
  write: (base64: string) => Promise<void>;
  finish: () => Promise<void>;
  dispose: () => Promise<void>;
}
export interface DownloadOptions {
  client: FileClient; threadId: string; path: string; signal: AbortSignal;
  target: (info: FileInfo) => Promise<DownloadTarget>;
  progress: (received: number, total: number) => void;
}
export class DownloadCancelled extends Error {}
function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DownloadCancelled();
}
export function validateFileInfo(info: FileInfo) {
  if (!info || typeof info.id !== 'string' || !/^[a-z\d-]{36}$/i.test(info.id)
    || !Number.isSafeInteger(info.size) || info.size < 0
    || typeof info.name !== 'string' || !info.name || /[\\/\x00-\x1f\x7f]/.test(info.name)
    || info.name === '.' || info.name === '..' || typeof info.mimeType !== 'string') {
    throw new Error('文件信息无效，请重试。');
  }
  checkDownloadSize(info.size);
  return info;
}
function validateChunk(chunk: FileChunk, offset: number, length: number) {
  if (!chunk || chunk.offset !== offset || typeof chunk.data !== 'string'
    || chunk.data.length !== Math.ceil(length / 3) * 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.data)
    || base64Bytes(chunk.data) !== length) throw new Error('文件下载不完整，请重试。');
}
async function transfer(options: DownloadOptions, info: FileInfo, target: DownloadTarget) {
  const { client, threadId, signal, progress } = options;
  progress(0, info.size);
  for (let offset = 0; offset < info.size;) {
    checkCancelled(signal);
    checkDownloadSize(info.size);
    const length = Math.min(FILE_CHUNK_BYTES, info.size - offset);
    const chunk = await client.read({ threadId, id: info.id, offset, length });
    checkCancelled(signal);
    validateChunk(chunk, offset, length);
    await target.write(chunk.data);
    offset += length;
    progress(offset, info.size);
  }
  checkCancelled(signal);
  await target.finish();
}
/** Await each disk write before requesting more bytes; always release both local and remote resources. */
export async function downloadFile(options: DownloadOptions) {
  checkCancelled(options.signal);
  const info = await options.client.open(options.threadId, options.path);
  let target: DownloadTarget | undefined;
  try {
    validateFileInfo(info);
    checkCancelled(options.signal);
    target = await options.target(info);
    await transfer(options, info, target);
  } finally {
    await target?.dispose().catch(() => console.warn('Unable to remove temporary download'));
    if (typeof info?.id === 'string') {
      await options.client.close(options.threadId, info.id)
        .catch(() => console.warn('Unable to close remote download; it will expire automatically'));
    }
  }
}
