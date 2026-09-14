export { CHAT_POLICY_FIELDS, DEFAULT_CHAT_POLICY, parseChatPolicy, type ChatPolicy }
  from '../../apps/admin/src/modules/chat-settings/chat-policy';
import { DEFAULT_CHAT_POLICY, parseChatPolicy } from '../../apps/admin/src/modules/chat-settings/chat-policy';

export const CHAT_POLICY_MESSAGE = 'chat-policy';
export const KIB = 1024;
export const MIB = KIB * KIB;
let current = { ...DEFAULT_CHAT_POLICY };
export function getChatPolicy() { return current; }
/** Only configuration received from the authenticated coordinator may update these limits. */
export function setChatPolicy(value: unknown) { current = parseChatPolicy(value); }
export function base64Bytes(data: string) {
  const encoded = data.slice(data.indexOf(',') + 1);
  return Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : Number(encoded.endsWith('=')));
}
/** Saturate only at JavaScript's exact byte-offset range, without a product size cap. */
export function videoByteLimit() {
  return Math.min(Number.MAX_SAFE_INTEGER, current.videoPreviewMaxMb * MIB);
}
export function imagePreviewByteLimit() {
  return Math.min(Number.MAX_SAFE_INTEGER, current.imagePreviewMaxMb * MIB);
}
export function imagePreviewCharLimit() {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(imagePreviewByteLimit() / 3) * 4 + 64);
}
export function textPreviewByteLimit() {
  return Math.min(Number.MAX_SAFE_INTEGER, current.filePreviewMaxMb * MIB);
}
export class DownloadPolicyError extends Error {}
export function checkDownloadSize(bytes: number) {
  if (bytes > current.fileDownloadMaxMb * MIB) {
    throw new DownloadPolicyError(`文件超过 ${current.fileDownloadMaxMb} MB，无法下载。`);
  }
}
