import { Buffer } from 'buffer';
import { afterEach, expect, it } from 'vitest';
import { remoteAttachments, validateUploadedFiles } from '../../../../shared/remote-chat/composerAttachments';
import { checkFileUploadSize, DEFAULT_CHAT_POLICY, MIB, setChatPolicy } from '../../../../shared/remote-chat/policy';

afterEach(() => setChatPolicy(DEFAULT_CHAT_POLICY));
const upload = (bytes: number) => ({ kind: 'file' as const, name: 'notes.txt', path: '',
  data: Buffer.alloc(bytes, 1).toString('base64') });

it('uses the configured size before reading a file and checks decoded bytes including base64 padding', () => {
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 1 });
  expect(() => checkFileUploadSize(MIB)).not.toThrow();
  expect(() => checkFileUploadSize(MIB + 1)).toThrow('1 MB');
  expect(remoteAttachments([upload(MIB)])).toHaveLength(1);
  // These all have the same encoded length; an encoded-length check alone lets two extra bytes through.
  for (const extra of [1, 2]) expect(() => remoteAttachments([upload(MIB + extra)])).toThrow('1 MB');
});

it('accepts files above the former 2 MB limit and rechecks drafts after a policy update', () => {
  const draft = [upload(2 * MIB + 1)];
  expect(() => remoteAttachments(draft)).toThrow('2 MB');
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 3 });
  expect(remoteAttachments(draft)).toEqual(draft);
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 1 });
  expect(() => validateUploadedFiles(draft)).toThrow('1 MB');
});

it('retains the total upload limit even with a larger per-file setting', () => {
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 100 });
  expect(remoteAttachments([upload(3 * MIB)])).toHaveLength(1);
  expect(() => remoteAttachments([upload(3 * MIB + 1)])).toThrow('文件合计不能超过 3 MB');
  expect(() => remoteAttachments([upload(2 * MIB), upload(2 * MIB)])).toThrow('文件合计不能超过 3 MB');
});

it('allows administrators to raise and lower the total independently from individual file sizes', () => {
  const files = [upload(4 * MIB), upload(4 * MIB)];
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 4, fileUploadTotalMaxMb: 8 });
  expect(remoteAttachments(files)).toEqual(files);
  expect(() => remoteAttachments([upload(4 * MIB + 1)])).toThrow('单个文件不能超过 4 MB');
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 4, fileUploadTotalMaxMb: 7 });
  expect(() => remoteAttachments(files)).toThrow('文件合计不能超过 7 MB');
});
