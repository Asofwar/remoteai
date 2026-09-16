import { useMemo, useState } from 'react';
import { highlightCode } from '../../../../shared/chat/codeHighlight';
import { ChatCopyButton } from './ChatCopyButton';

const PAGE_CHARACTERS = 8_000;

export function ChatCodeBlock({ text, language = '', label, copyLabel = '复制代码' }: {
  text: string; language?: string; label?: string; copyLabel?: string;
}) {
  const [limit, setLimit] = useState(PAGE_CHARACTERS);
  // Bound highlighting and DOM work while progressively exposing the complete output.
  const visible = text.slice(0, limit);
  const spans = useMemo(() => highlightCode(visible, language), [visible, language]);
  const more = limit < text.length;
  return <section className="chat-code-block">
    <header><span>{label || language || '代码'}</span><ChatCopyButton text={text} label={copyLabel} /></header>
    <pre tabIndex={0} onScroll={event => {
      const node = event.currentTarget;
      if (more && node.scrollHeight - node.scrollTop - node.clientHeight < 100) {
        setLimit(value => value + PAGE_CHARACTERS);
      }
    }}><code>{spans.map((span, index) => <span key={index} style={{ color: span.color }}>{span.text}</span>)}</code></pre>
    {more && <button type="button" className="chat-text-action" onClick={() => setLimit(value => value + PAGE_CHARACTERS)}>
      显示更多内容</button>}
  </section>;
}
