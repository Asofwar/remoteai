import { expect, it } from 'vitest';
import { markdownContent, reviewLocation } from './markdownContent';

const directive = '::code-comment{title="[P2] 空输入" body="先检查输入。" file="README.md" start="3" end="5"}';

it('renders review cards between Markdown blocks using the desktop directive contract', () => {
  const content = markdownContent(`## 审查意见\n\n${directive}\n\n**审查完成。**`);
  expect(content.map((entry) => entry.type)).toEqual(['block', 'review', 'block']);
  expect(content[1]).toEqual({ type: 'review', comment: {
    title: '[P2] 空输入', body: '先检查输入。', file: 'README.md', start: 3, end: 5,
  } });
});

it('keeps fenced examples and incomplete streamed directives readable as Markdown', () => {
  const content = markdownContent(`\`\`\`text\n${directive}\n\`\`\``);
  expect(content[0]).toMatchObject({ type: 'block', node: { token: { type: 'fence', content: `${directive}\n` } } });
  const partial = directive.slice(0, -1);
  expect(markdownContent(partial).every((entry) => entry.type === 'block')).toBe(true);
  expect(markdownContent(`${partial}}`)[0].type).toBe('review');
});

it('opens review files at their first line and labels the whole relevant range', () => {
  expect(reviewLocation({ title: '意见', body: '说明', file: 'F:/project/file.ts', start: 3, end: 5 }))
    .toEqual({ reference: { path: 'F:/project/file.ts', line: 3 }, label: 'F:/project/file.ts · 第 3–5 行' });
  expect(reviewLocation({ title: '意见', body: '说明', file: 'README.md', start: 5, end: 3 }).label)
    .toBe('README.md · 第 5 行');
});

it('does not make executable or network file destinations interactive', () => {
  for (const file of ['javascript:alert(1)', '//server/share/file.ts', 'file://server/share/file.ts']) {
    expect(reviewLocation({ title: '意见', body: '说明', file }).reference).toBeUndefined();
  }
});
