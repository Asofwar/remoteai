// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { INLINE_PASTE_CHARACTERS, INLINE_PASTE_LINES, pastedTextFile } from '../../../../../shared/chat/pastedText';
import { readFileBase64 } from '../../../../../shared/chat/fileData';
import { readPastedContent } from '../../../../../shared/chat/clipboard';

it('leaves ordinary pastes inline and converts large or many-line text to unique UTF-8 files', async () => {
  expect(pastedTextFile('a'.repeat(INLINE_PASTE_CHARACTERS))).toBeNull();
  expect(pastedTextFile('line\n'.repeat(INLINE_PASTE_LINES - 1))).toBeNull();
  const text = '你好 👩‍💻\n<&>\t'.repeat(10_000);
  const first = pastedTextFile(text)!;
  const second = pastedTextFile('line\n'.repeat(INLINE_PASTE_LINES))!;
  expect(first.name).toMatch(/^pasted-text-.*\.txt$/);
  expect(second.name).not.toBe(first.name);
  expect(Buffer.from(await readFileBase64(first), 'base64').toString('utf8')).toBe(text);
});

it('avoids creating a DOM tree for a large formatted text copy without images', () => {
  const create = vi.spyOn(document, 'createElement');
  try {
    const text = 'const example = 1;\n'.repeat(20_000);
    const html = '<span style="color:red">const example = 1;</span><br>'.repeat(20_000);
    const content = readPastedContent({ getData: type => type === 'text/html' ? html : text } as DataTransfer);
    expect(content.text).toBe(text);
    expect(create).not.toHaveBeenCalled();
  } finally { create.mockRestore(); }
});
