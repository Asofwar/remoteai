import { describe, expect, it } from 'vitest';
import { appendQuote, clearSubmittedQuotes, replyWithQuotes, type ChatQuote } from './replyQuotes';

const entry = (text: string, messageId = 'answer'): ChatQuote => ({ text, messageId, role: 'assistant' });

describe('chat reply quotes', () => {
  it('preserves independent selections and ignores an identical selection from the same message', () => {
    const first = appendQuote([], entry(' 第一段\n第二行 ')).quotes;
    const duplicate = appendQuote(first, entry('第一段\n第二行')).quotes;
    expect(duplicate).toBe(first);
    const separate = appendQuote(first, entry('第一段\n第二行', 'another-answer')).quotes;
    expect(separate).toHaveLength(2);
  });

  it('rejects oversized selections without truncating or losing an existing quote', () => {
    const existing = [entry('保留')];
    expect(appendQuote(existing, entry('x'.repeat(16_001)))).toEqual({
      quotes: existing, error: '这段内容太长，请缩小引用范围。',
    });
    expect(appendQuote([], entry('x'.repeat(16_000))).quotes).toHaveLength(1);
    expect(appendQuote(existing, entry(' \n ')).quotes).toBe(existing);
  });

  it('allows eight quotes and keeps all of them when another selection exceeds the limit', () => {
    const quotes = Array.from({ length: 8 }, (_, index) => entry(String(index)));
    expect(appendQuote(quotes, entry('9'))).toEqual({ quotes, error: '一次最多添加 8 条引用。' });
    expect(appendQuote(quotes, quotes[0])).toEqual({ quotes });
  });

  it('sends quotes using the PC format while preserving Unicode and multiline code', () => {
    expect(replyWithQuotes('请解释', [entry('第一段 😀\r\n\r\nconst x = 1;'), entry('另一段')]))
      .toBe('引用 AI 回答：\n> 第一段 😀\n> \n> const x = 1;\n\n> 另一段\n\n请解释');
    expect(replyWithQuotes('', [entry('仅引用')])).toBe('引用 AI 回答：\n> 仅引用');
    expect(replyWithQuotes('普通消息', [])).toBe('普通消息');
  });

  it('identifies quoted user and tool text as conversation content', () => {
    expect(replyWithQuotes('检查', [{ ...entry('输出'), role: 'tool' }]))
      .toBe('引用对话内容：\n> 输出\n\n检查');
  });

  it('clears only successfully submitted quotes, retaining selections added during the request', () => {
    const submitted = entry('发送中的内容');
    const later = entry('后来选择的内容');
    expect(clearSubmittedQuotes([submitted, later], [submitted])).toEqual([later]);
  });
});
