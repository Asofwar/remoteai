import type { GuiAccountsClient } from '../../../../shared/remote-chat/guiAccounts';
import { guiAccountAvatar } from '../../../../shared/remote-chat/guiAccountAvatar';
import { useGuiAccounts } from '../../../../shared/remote-chat/client/useGuiAccounts';
import { t, useLanguage } from '../i18n';
import './chat-list-button.css';

interface Props {
  client: GuiAccountsClient; active: boolean; ready: boolean; expanded: boolean; onClick: () => void;
}

export function ChatListButton({ client, active, ready, expanded, onClick }: Props) {
  useLanguage();
  const { snapshot } = useGuiAccounts(client, active && ready);
  const avatar = guiAccountAvatar(snapshot, t('我'));
  return <button type="button" className="chat-list-button"
    aria-label={expanded ? t('收起聊天列表') : t('打开聊天列表')} aria-expanded={expanded} onClick={onClick}>
    <span className="chat-list-avatar" aria-hidden="true">{avatar.initials}</span>
  </button>;
}
