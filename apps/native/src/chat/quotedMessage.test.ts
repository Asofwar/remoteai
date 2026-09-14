import { describe, expect, it } from 'vitest';
import { quotedMessage } from './quotedMessage';
import { replyWithQuotes, type ChatQuote } from './replyQuotes';

describe('quoted messages in chat history', () => {
  it('separates multiple PC-compatible quotes from the user reply without losing code or blank lines', () => {
    const quotes: ChatQuote[] = [
      { messageId: 'a', role: 'assistant', text: '第一段 😀\n\n  const value = 0;' },
      { messageId: 'b', role: 'assistant', text: '> nested quote\n第二条' },
    ];
    const text = '请解释这两段\n\n保留正文段落';
    expect(quotedMessage(replyWithQuotes(text, quotes))).toEqual({ text, quotes: quotes.map((quote) => quote.text) });
  });

  it('reads quote-only messages and mixed user/tool quotes after a reload', () => {
    const quotes: ChatQuote[] = [{ messageId: 'tool', role: 'tool', text: '完成\n退出码：0' }];
    expect(quotedMessage(replyWithQuotes('', quotes))).toEqual({ text: '', quotes: [quotes[0].text] });
    expect(quotedMessage('引用 AI 回答：\r\n> 第一行\r\n> 第二行\r\n\r\n问题'))
      .toEqual({ text: '问题', quotes: ['第一行\n第二行'] });
  });

  it.each([
    '普通消息\r\n> 普通引用', '正文中的引用 AI 回答：\n> 引用', '引用 AI 回答：\n未引用的文字',
    '引用 AI 回答：\n> 内容\n缺少分隔的正文', '引用 AI 回答：\n> \n\n正文',
  ])('keeps unrecognized or malformed text untouched: %s', (text) => {
    expect(quotedMessage(text)).toEqual({ text, quotes: [] });
  });
});
