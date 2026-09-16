import { memo } from 'react';
import { Quote } from 'lucide-react';
import type { Item } from './types';
import { itemImageSources } from '../../../../shared/chat/imageSources';
import { quotedMessage } from '../../../../shared/chat/quotedMessage';
import { questionMessageText } from '../../../../shared/remote-chat/client/asyncQuestions';
import { ChatActivity } from './ChatActivity';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { ChatCopyButton } from './ChatCopyButton';
import { ChatQuoteButton } from './ChatQuotes';

export const ChatMessage = memo(function ChatMessage({ item, onOpen, process = false, running = false, onQuote }: {
  item: Item; onOpen: (id: string) => void; process?: boolean; running?: boolean; onQuote?: () => void;
}) {
  const text = questionMessageText(item);
  if (!['userMessage', 'agentMessage'].includes(item.type)) {
    return <ChatActivity item={item} onOpen={onOpen} running={running && item.status === 'inProgress'} />;
  }
  const user = item.type === 'userMessage';
  const content = quotedMessage(text);
  return <article className={user ? 'chat-user-message-wrap' : 'chat-assistant-message'}>
    {user ? <div className="chat-user-message">
      {content.quotes.map((quote, index) => <details className="chat-message-quote" key={index}>
        <summary><Quote size={14} /><span>{quote}</span></summary><blockquote>{quote}</blockquote>
      </details>)}
      {content.text && <div>{content.text}</div>}
      {itemImageSources(item).map((source, index) => <ChatImage key={index} source={source} />)}
    </div> : <ChatMarkdown text={text} process={process} />}
    {!!text.trim() && !running && <div className="chat-message-actions">
      <ChatCopyButton text={text} label={user ? '复制消息' : '复制回复'} />
      <ChatQuoteButton messageId={item.id} text={text} role={user ? 'user' : 'assistant'} onQuote={onQuote} />
    </div>}
  </article>;
});
