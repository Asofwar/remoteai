import { expect, it } from 'vitest';
import { fileLanguage, highlightCode } from './codeHighlight';

it('matches desktop syntax colors while retaining the exact source text', () => {
  const code = 'const greeting: string = "你好"; // comment\nconsole.log(42);';
  const spans = highlightCode(code, 'typescript');
  expect(spans.map((span) => span.text).join('')).toBe(code);
  expect(spans).toEqual(expect.arrayContaining([
    { text: 'const', color: '#8950ab' }, { text: '"你好"', color: '#217745' },
    { text: '// comment', color: '#78817e' }, { text: '42', color: '#a45817' },
  ]));
});

it('uses plain selectable text for unknown languages and expensive generated files', () => {
  expect(highlightCode('hello <world>', 'unknown-language')).toEqual([{ text: 'hello <world>' }]);
  const large = 'const value = 1;\n'.repeat(2_000);
  expect(highlightCode(large, 'javascript')).toEqual([{ text: large }]);
  const dense = 'const x=1;'.repeat(800);
  expect(highlightCode(dense, 'javascript')).toEqual([{ text: dense }]);
});

it('recognizes the same file extensions as the desktop code viewer', () => {
  expect(fileLanguage('F:/project/Component.TSX')).toBe('typescript');
  expect(fileLanguage('src/main.rs')).toBe('rust');
  expect(fileLanguage('config.toml')).toBe('ini');
  expect(fileLanguage('README')).toBe('');
});
