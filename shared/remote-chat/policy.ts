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
export class DownloadPolicyError extends Error {}
export function checkDownloadSize(bytes: number) {
  if (bytes > current.fileDownloadMaxMb * MIB) {
    throw new DownloadPolicyError(`文件超过 ${current.fileDownloadMaxMb} MB，无法下载。`);
  }
}
