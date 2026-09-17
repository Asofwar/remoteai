import type { Item } from './types';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { messageLabel } from '../../../../shared/chat/messageDetails';
import { toolText } from '../../../../shared/chat/toolText';
import { ChatQuoteButton } from './ChatQuotes';
import { ChatToolContent } from './ChatToolContent';
export function ChatToolDetails({ item, onClose, onBack }: {
  item: Item; onClose: () => void; onBack?: () => void;
}) {
  return <AdaptiveSheet open title={messageLabel(item)} width={760} onClose={onClose} onBack={onBack}
    presentation={item.type === 'fileChange' ? 'drawer' : 'adaptive'}>
    <div className="chat-detail-stack">
      {item.status === 'inProgress' && <p className="chat-muted">进行中…</p>}
      <ChatToolContent item={item} />
      <ChatQuoteButton messageId={item.id} role="tool" text={toolText(item)} onQuote={onClose} />
    </div>
  </AdaptiveSheet>;
}
