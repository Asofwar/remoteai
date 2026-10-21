import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { foldService, HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';
import type { BrowserTranslate } from './ProjectTree';

const PLAIN_TEXT = /\.(txt|log|csv|tsv|md|markdown|rst)$/i;

/** Determine syntax from the filename only; prose must never be auto-detected as code. */
export function editorLanguage(path: string) {
  if (PLAIN_TEXT.test(path)) return null;
  return LanguageDescription.matchFilename(languages, path.split(/[\\/]/).at(-1) ?? '') ?? null;
}

/** Text without a grammar can still fold paragraphs and indented sections. */
export const textFolding = foldService.of((state, from, to) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim()) return null;
  const indentation = line.text.search(/\S/);
  let end = to;
  for (let number = line.number + 1; number <= state.doc.lines; number += 1) {
    const next = state.doc.line(number);
    if (!next.text.trim() || (indentation > 0 && next.text.search(/\S/) < indentation)) break;
    end = next.to;
  }
  return end > to ? { from: to, to: end } : null;
});

export const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--pf-ink)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--pf-ink)', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--pf-subtle)', color: 'var(--pf-muted)',
    borderRight: '1px solid var(--pf-border)' },
  '.cm-lineNumbers .cm-gutterElement': { cursor: 'pointer' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0', cursor: 'pointer' },
  // Use the first visual line's height so wrapping never moves the arrow below its line number.
  '.cm-foldGutter span': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '16px', height: '1.6em', padding: '0', verticalAlign: 'top' },
  '.cm-foldGutter svg': { display: 'block' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--pf-hover)' },
  '.cm-panels': { color: 'var(--pf-ink)', backgroundColor: 'var(--pf-surface)', borderColor: 'var(--pf-border)' },
  '.cm-search': { padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  '.cm-search .cm-textfield': { minWidth: '60px', maxWidth: '150px', fontSize: '16px',
    color: 'var(--pf-ink)', backgroundColor: 'var(--pf-subtle)', border: '1px solid var(--pf-border)' },
  '.cm-search .cm-button': { minHeight: '30px', backgroundImage: 'none', color: 'var(--pf-ink)',
    backgroundColor: 'var(--pf-subtle)', border: '1px solid var(--pf-border)' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' },
  '.cm-search br': { display: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--pf-ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--pf-selection)' },
  '.cm-tooltip': { backgroundColor: 'var(--pf-surface)', color: 'var(--pf-ink)' },
});

export const editorHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--pf-code-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--pf-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--pf-code-number)' },
  { tag: [tags.function(tags.variableName), tags.typeName, tags.className], color: 'var(--pf-code-function)' },
  { tag: [tags.comment, tags.meta], color: 'var(--pf-muted)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--pf-code-property)' },
  { tag: tags.invalid, textDecoration: 'underline wavy #d14343' },
]));

export function editorPhrases(t: BrowserTranslate): Extension {
  const labels: Record<string, string> = {
    Find: '查找', Replace: '替换', next: '下一个', previous: '上一个', all: '全部',
    'match case': '区分大小写', regexp: '正则表达式', 'by word': '全字匹配',
    replace: '替换', 'replace all': '全部替换', close: '关闭',
    'Fold line': '折叠此行', 'Unfold line': '展开此行', 'Go to line': '跳转到行', go: '跳转',
    'current match': '当前匹配', 'replaced $ matches': '已替换 $ 处',
  };
  return EditorState.phrases.of(Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, t(value)])));
}
