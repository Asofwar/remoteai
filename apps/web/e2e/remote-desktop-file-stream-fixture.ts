import type { Channel } from '@tauri-apps/api/core';
import { CLIPBOARD_CHUNK_BYTES, decodeClipboardBytes, encodeClipboardBytes,
  type ClipboardContent, type ClipboardMessage, type ClipboardReply } from '../../../shared/remote-desktop/clipboard';
import type { FileOffer, FileReadEvent } from '../../../shared/remote-desktop/fileClipboard';

type FileContent = Extract<ClipboardContent, { format: 'files' }>;
type LocalRequest = { action: string; offer?: FileOffer; request?: FileReadEvent; requestId?: string; data?: string };
const pending = new Map<string, (data: string | undefined) => void>();
const sources = new Map<string, FileContent>();
let localRead: Channel<FileReadEvent> | undefined;
let receivedOffer: FileOffer | undefined;

export const fileStreamFixture = {
  hostBytes: [] as string[], localBytes: [] as string[], reads: [] as FileReadEvent[], errors: [] as string[],
  async pasteLocal() {
    if (!receivedOffer || !localRead) throw new Error('No local file promise');
    this.localBytes = await download(receivedOffer, localRead);
  },
};

export function promised(content: ClipboardContent): ClipboardContent {
  if (content.format !== 'files') return content;
  const offer = { id: crypto.randomUUID(), files: content.files.map(file => ({
    name: file.name, size: decodeClipboardBytes(file.data).length,
  })) };
  sources.set(offer.id, content);
  return { format: 'fileOffer', offer };
}

function chunk(request: FileReadEvent) {
  const content = sources.get(request.offerId);
  if (!content) throw new Error('Missing source');
  const bytes = decodeClipboardBytes(content.files[request.index].data);
  return encodeClipboardBytes(bytes.subarray(request.offset, request.offset + request.length));
}

async function download(offer: FileOffer, channel: Channel<FileReadEvent>) {
  return Promise.all(offer.files.map(async (file, index) => {
    const bytes = new Uint8Array(file.size);
    for (let offset = 0; offset < file.size; offset += CLIPBOARD_CHUNK_BYTES) {
      const event: FileReadEvent = { kind: 'clipboardFileRead', requestId: crypto.randomUUID(),
        offerId: offer.id, index, offset, length: Math.min(CLIPBOARD_CHUNK_BYTES, file.size - offset) };
      const reply = new Promise<string | undefined>(resolve => pending.set(event.requestId, resolve));
      fileStreamFixture.reads.push(event); channel.onmessage(event);
      const data = await reply;
      if (data === undefined) throw new Error('Read failed');
      bytes.set(decodeClipboardBytes(data), offset);
    }
    return encodeClipboardBytes(bytes);
  }));
}

export function localFileRequest(request: LocalRequest, channel: Channel<FileReadEvent>,
  local: { content: ClipboardContent }) {
  switch (request.action) {
    case 'read': return { content: promised(local.content) };
    case 'chunk': return { data: chunk(request.request!) };
    case 'publish':
      receivedOffer = request.offer; localRead = channel;
      local.content = { format: 'fileOffer', offer: request.offer! }; return {};
    case 'reply': pending.get(request.requestId!)?.(request.data); pending.delete(request.requestId!); return {};
    case 'release': receivedOffer = undefined; localRead = undefined; return {};
    default: throw new Error('Invalid local request');
  }
}

export function hostFileRequest(message: ClipboardMessage, channel: Channel<FileReadEvent>): ClipboardReply {
  const reply: ClipboardReply = { kind: 'clipboard', requestId: message.requestId, result: {} };
  if (message.request.action !== 'files') throw new Error('Expected file request');
  const request = message.request.request;
  if (request.action === 'publish' && request.paste) {
    void download(request.offer, channel).then(bytes => { fileStreamFixture.hostBytes = bytes; },
      error => fileStreamFixture.errors.push(String(error)));
  }
  if (request.action === 'chunk') return { ...reply, result: { data: chunk(request.request as FileReadEvent) } };
  if (request.action === 'reply') {
    pending.get(request.requestId)?.(request.data); pending.delete(request.requestId);
  }
  return reply;
}
