import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { HelpCopy } from './copy';
import type { HelpMessage } from './types';
import styles from './helpAssistant.module.less';

export function HelpMessages(props: { messages: HelpMessage[]; pending: string; copy: HelpCopy }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }); }, [props.messages, props.pending]);
  return <div className={styles.messages} role="log" aria-live="polite" aria-label={props.copy.title}>
    {props.messages.map((message) => <article key={message.id}
      className={message.role === 'user' ? styles.question : styles.answer}>
      {message.role === 'user' ? message.text : <Markdown remarkPlugins={[remarkGfm]} skipHtml
        components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{message.text}</Markdown>}
      {Boolean(message.sources?.length) && <details className={styles.sources}>
        <summary>{props.copy.sources}</summary>
        {message.sources?.map((source) => <div key={source}>{source}</div>)}
      </details>}
    </article>)}
    {props.pending && <><article className={styles.question}>{props.pending}</article>
      <div className={styles.thinking} role="status">{props.copy.thinking}</div></>}
    <div ref={bottom} />
  </div>;
}
