import { CLIPBOARD_CHUNK_BYTES, decodeClipboardBytes, encodeClipboardBytes,
  type ClipboardContent, type ClipboardMessage, type ClipboardReply } from '../../../shared/remote-desktop/clipboard';

export const clipboardFixture = {
  content: { format: 'text', text: 'Remote clipboard 测试' } as ClipboardContent,
  requests: [] as ClipboardMessage[], pastes: 0, error: '',
  revision: 1, copies: 0, writes: 0, nativePastes: 0, readAllowed: true, writeAllowed: true, shareable: true,
  changeDuringUpload: undefined as ClipboardContent | undefined,
};
let transfer = new Uint8Array();
let observedRevision = 1;

function nativePaste(): NonNullable<ClipboardReply['result']> {
  clipboardFixture.pastes += 1; clipboardFixture.nativePastes += 1;
  observedRevision = clipboardFixture.revision;
  return { pasted: true };
}

/** Substitute OS clipboard access only; production control queues and WebRTC carry every request and reply. */
export function desktopClipboard(message: ClipboardMessage, content = clipboardFixture.content): ClipboardReply {
  clipboardFixture.requests.push(message);
  const reply: ClipboardReply = { kind: 'clipboard', requestId: message.requestId, result: {} };
  if (clipboardFixture.error) return { ...reply, error: clipboardFixture.error };
  const request = message.request;
  switch (request.action) {
    case 'copy':
      clipboardFixture.copies += 1; observedRevision = clipboardFixture.revision;
      if (!clipboardFixture.readAllowed || !clipboardFixture.shareable) return reply;
      transfer = new TextEncoder().encode(JSON.stringify(content));
      return { ...reply, result: { length: transfer.length } };
    case 'paste':
      return { ...reply, result: request.preferLocal && clipboardFixture.writeAllowed
        && observedRevision === clipboardFixture.revision
        ? { pasted: false, revision: String(clipboardFixture.revision) } : nativePaste() };
    case 'read':
      transfer = new TextEncoder().encode(JSON.stringify(content));
      return { ...reply, result: { length: transfer.length } };
    case 'begin': transfer = new Uint8Array(request.length); return reply;
    case 'append':
      transfer.set(decodeClipboardBytes(request.data), request.offset);
      if (clipboardFixture.changeDuringUpload) {
        clipboardFixture.content = clipboardFixture.changeDuringUpload;
        clipboardFixture.changeDuringUpload = undefined; clipboardFixture.revision += 1;
      }
      return reply;
    case 'chunk': return { ...reply, result: {
      data: encodeClipboardBytes(transfer.subarray(request.offset, request.offset + CLIPBOARD_CHUNK_BYTES)),
    } };
    case 'commit':
      if (request.expectedRevision && request.expectedRevision !== String(clipboardFixture.revision)) {
        return { ...reply, result: nativePaste() };
      }
      clipboardFixture.content = JSON.parse(new TextDecoder().decode(transfer)) as ClipboardContent;
      clipboardFixture.writes += 1; clipboardFixture.revision += 1; observedRevision = clipboardFixture.revision;
      if (request.paste) clipboardFixture.pastes += 1;
      return reply;
    case 'clear': transfer = new Uint8Array(); return reply;
    case 'files': throw new Error('File streaming fixture is not enabled');
  }
}
