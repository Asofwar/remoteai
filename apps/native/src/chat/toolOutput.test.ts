import { expect, it } from 'vitest';
import { TOOL_OUTPUT_PAGE_CHARACTERS, toolOutputPage, toolOutputText } from './toolOutput';

it('preserves literal HTML and Markdown in raw tool strings instead of dropping or formatting them', () => {
  const text = '<div>important output</div>\n**literal text**\n  indentation';
  expect(toolOutputText(text)).toEqual({ text, markdown: false });
  expect(toolOutputPage(text, 0).visible).toBe(text);
  expect(toolOutputText({ type: 'text', text })).toEqual({ text, markdown: true });
});

it('bounds a megabyte in one paragraph before Markdown parsing without losing any output', () => {
  const text = 'x'.repeat(1_000_000);
  const first = toolOutputPage(text, 0);
  expect(first.visible).toHaveLength(TOOL_OUTPUT_PAGE_CHARACTERS);
  expect(first.pages).toBe(125);
  expect(Array.from({ length: first.pages }, (_, page) => toolOutputPage(text, page).visible).join('')).toBe(text);
});

it('keeps emoji intact at page boundaries and preserves the final characters', () => {
  const text = `${'a'.repeat(TOOL_OUTPUT_PAGE_CHARACTERS - 1)}🙂最后一行`;
  const first = toolOutputPage(text, 0);
  const second = toolOutputPage(text, 1);
  expect(first.visible).toBe('a'.repeat(TOOL_OUTPUT_PAGE_CHARACTERS - 1));
  expect(second.visible).toBe('🙂最后一行');
  expect(first.visible + second.visible).toBe(text);
});

it('clamps stale pages after a result changes and leaves media and structured values to their own renderers', () => {
  expect(toolOutputPage('short', 20)).toEqual({ page: 0, pages: 1, visible: 'short' });
  expect(toolOutputPage('', 0)).toEqual({ page: 0, pages: 1, visible: '' });
  for (const value of [null, false, 0, { type: 'image', data: 'image' }, { result: 'value' }]) {
    expect(toolOutputText(value)).toBeUndefined();
  }
});
