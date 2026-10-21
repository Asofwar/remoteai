import { Buffer } from 'buffer';
import { afterEach, describe, expect, it } from 'vitest';
import { appendQuote, type ChatQuote } from '../../../../shared/chat/replyQuotes';
import { ChatImageError, validateChatImages } from '../../../../shared/remote-chat/attachments';
import { remoteAttachments } from '../../../../shared/remote-chat/composerAttachments';
import { compressChatImage, ImagePolicyError } from '../../../../shared/remote-chat/compressImage';
import { checkDownloadSize, checkFileUploadSize, DEFAULT_CHAT_POLICY, DownloadPolicyError, MIB, setChatPolicy,
  UploadPolicyError } from '../../../../shared/remote-chat/policy';
import { MAX_FPS, validateSettings } from '../../../../shared/remote-desktop/protocol';
import { setInterfaceLanguage } from '../../../../shared/i18n/interfaceLanguage';
import { translateText } from '../../../../shared/i18n/translate';
import type { Language } from '../../../../shared/i18n/language';

const han = /[一-鿿]/;
const quote = (text: string): ChatQuote => ({ text, messageId: 'answer', role: 'assistant' });
const upload = (bytes: number) => ({ kind: 'file' as const, name: 'notes.txt', path: '',
  data: Buffer.alloc(bytes, 1).toString('base64') });
const image = 'data:image/png;base64,AAAA';
const thrown = (action: () => unknown) => {
  try { action(); } catch (error) { return error as Error; }
  throw new Error('Expected the action to throw.');
};

afterEach(() => { setInterfaceLanguage('zh'); setChatPolicy(DEFAULT_CHAT_POLICY); });

describe.each<Language>(['en', 'ru'])('shared limit messages in %s', (language) => {
  const expected = (source: string, value1: number) => {
    const text = translateText(language, source, { value1 });
    expect(text).not.toMatch(han);
    expect(text).toContain(String(value1));
    return text;
  };

  it('translates quote and image count limits with the configured maximum', () => {
    setInterfaceLanguage(language);
    const quotes = Array.from({ length: 8 }, (_, index) => quote(String(index)));
    expect(appendQuote(quotes, quote('9')).error).toBe(expected('一次最多添加 {value1} 条引用。', 8));
    const error = thrown(() => validateChatImages(Array.from({ length: 9 }, () => image)));
    expect(error).toBeInstanceOf(ChatImageError);
    expect(error.message).toBe(expected('一次最多添加 {value1} 张图片。', 8));
  });

  it('translates upload, download and compression limits with the policy values', async () => {
    setInterfaceLanguage(language);
    setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 4, fileUploadTotalMaxMb: 7, fileDownloadMaxMb: 5,
      imageTargetKb: 32 });
    const single = thrown(() => checkFileUploadSize(4 * MIB + 1));
    expect(single).toBeInstanceOf(UploadPolicyError);
    expect(single.message).toBe(expected('单个文件不能超过 {value1} MB，请选择较小的文件。', 4));
    const total = thrown(() => remoteAttachments([upload(4 * MIB), upload(4 * MIB)]));
    expect(total).toBeInstanceOf(UploadPolicyError);
    expect(total.message).toBe(expected('每次发送的文件合计不能超过 {value1} MB，请减少文件。', 7));
    const download = thrown(() => checkDownloadSize(5 * MIB + 1));
    expect(download).toBeInstanceOf(DownloadPolicyError);
    expect(download.message).toBe(expected('文件超过 {value1} MB，无法下载。', 5));
    const compression = await compressChatImage(async () => ({ value: '', bytes: MIB })).catch(error => error);
    expect(compression).toBeInstanceOf(ImagePolicyError);
    expect(compression.message).toBe(expected('图片无法压缩至 {value1} KB，请换一张图片。', 32));
  });

  it('translates the remote desktop frame rate range', () => {
    setInterfaceLanguage(language);
    expect(() => validateSettings({ fps: MAX_FPS + 1, quality: 'auto' }))
      .toThrow(expected('帧率应为 1–{value1} 的整数。', MAX_FPS));
  });
});

it('keeps the Chinese messages byte-identical', async () => {
  setInterfaceLanguage('zh');
  const quotes = Array.from({ length: 8 }, (_, index) => quote(String(index)));
  expect(appendQuote(quotes, quote('9')).error).toBe('一次最多添加 8 条引用。');
  expect(() => validateChatImages(Array.from({ length: 9 }, () => image))).toThrow('一次最多添加 8 张图片。');
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 4, fileUploadTotalMaxMb: 7, fileDownloadMaxMb: 5,
    imageTargetKb: 32 });
  expect(() => checkFileUploadSize(4 * MIB + 1)).toThrow('单个文件不能超过 4 MB，请选择较小的文件。');
  expect(() => remoteAttachments([upload(4 * MIB), upload(4 * MIB)]))
    .toThrow('每次发送的文件合计不能超过 7 MB，请减少文件。');
  expect(() => checkDownloadSize(5 * MIB + 1)).toThrow('文件超过 5 MB，无法下载。');
  await expect(compressChatImage(async () => ({ value: '', bytes: MIB })))
    .rejects.toThrow('图片无法压缩至 32 KB，请换一张图片。');
  expect(() => validateSettings({ fps: 0, quality: 'auto' })).toThrow('帧率应为 1–144 的整数。');
});

it('marks attachment validation failures with the upload policy type', () => {
  for (const value of [Array.from({ length: 9 }, () => upload(1)), [{ ...upload(1), name: '' }],
    [{ kind: 'file', name: 'notes.txt', path: '', data: '***' }]]) {
    expect(thrown(() => remoteAttachments(value))).toBeInstanceOf(UploadPolicyError);
  }
});
