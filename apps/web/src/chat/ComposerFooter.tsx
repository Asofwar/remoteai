import { formatConversationTokens } from '../../../../shared/remote-chat/usage';
import { t, useLanguage } from '../i18n';
import type { ComposerProps } from './composerProps';
import { ConversationPerformance } from './ConversationPerformance';
import './composerFooter.css';

type Props = Pick<ComposerProps, 'connectionInfo' | 'tokenUsage' | 'readConversationMetrics' | 'threadId' | 'active'>
  & { desktop: boolean };

export function ComposerFooter({ desktop, connectionInfo, tokenUsage, readConversationMetrics, threadId, active }: Props) {
  useLanguage();
  if (!desktop && !connectionInfo) return null;
  return <div className="chat-composer-hint">
    {desktop && <span>{t('Enter 发送 · Shift + Enter 换行')}</span>}
    <div className="chat-composer-details">
      {connectionInfo}
      {desktop && <span className="chat-conversation-metrics">
        <ConversationPerformance read={readConversationMetrics} threadId={threadId} active={active} />
        <span aria-hidden="true"> · </span>
        <span>{formatConversationTokens(tokenUsage?.total.totalTokens)} tokens</span>
      </span>}
    </div>
  </div>;
}
