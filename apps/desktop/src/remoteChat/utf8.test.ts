import { afterEach, expect, it, vi } from 'vitest';
const Decoder = TextDecoder;
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each([true, false])('preserves ASCII, Unicode and BOM with native decoder available: %s', async (native) => {
  vi.stubGlobal('TextDecoder', native ? Decoder : undefined); vi.resetModules();
  const { decodeChatUtf8 } = await import('../../../../shared/remote-chat/utf8');
  for (const source of ['', 'file\0data'.repeat(1000), '中文 👩‍💻\n', '\ufeffprefix']) {
    expect(decodeChatUtf8(new TextEncoder().encode(source))).toBe(source);
  }
  for (const bytes of [[0x80], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    expect(() => decodeChatUtf8(new Uint8Array(bytes))).toThrow();
  }
});
