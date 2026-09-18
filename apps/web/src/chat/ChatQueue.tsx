import { t, useLanguage } from '../i18n';
import { ArrowDown, ArrowUp, CornerDownRight, Trash2 } from 'lucide-react';
import type { QueueProps } from '../../../../shared/remote-chat/client/queueProps';
import './queue.css';
import { useQueueSelection } from '../../../../shared/remote-chat/client/useQueueSelection';

type Props = QueueProps & { edit: (id: string) => Promise<void>; editDisabled: boolean };

export function ChatQueue({ messages, running, disabled, act, edit, editDisabled }: Props) {
  useLanguage();
  const { selected, select, canMoveUp, canMoveDown } = useQueueSelection(messages, disabled);
  if (!messages.length) return null;
  const sending = messages.some((message) => message.busy);
  return <section className="chat-queue" aria-label={t("待发送消息")}>
    <div className="chat-queue-heading"><span>{t("待发送 ·")} {messages.length}</span>
      <div className="chat-queue-actions">
      {!running && <button type="button" disabled={disabled || sending}
        onClick={() => void act('queueFlush')}>{t("发送全部")}</button>}
      <button type="button" aria-label={t("上移待发送消息")} disabled={!canMoveUp}
        onClick={() => void act('queueMoveUp', selected.id)}><ArrowUp size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={t("下移待发送消息")} disabled={!canMoveDown}
        onClick={() => void act('queueMoveDown', selected.id)}><ArrowDown size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={t("编辑待发送消息")} disabled={disabled || editDisabled || selected.busy}
        onClick={() => void edit(selected.id)}>{t("编辑")}</button></div></div>
    <ul>{messages.map((message) => <li key={message.id}
      className={messages.length > 1 && selected.id === message.id ? 'chat-queue-selected' : undefined}>
      <CornerDownRight size={15} aria-hidden="true" />
      <div className="chat-queue-content"><button type="button" className="chat-queue-select"
        aria-label={t("选择待发送消息：{value1}", { value1: message.text })} aria-pressed={selected.id === message.id}
        onClick={() => select(message.id)}><p>{message.text || t("图片消息")}</p></button>
        {message.imageCount > 0 && <small>{message.imageCount}  {t("张图片")} </small>}
        {message.attachmentCount > 0 && <small>{message.attachmentCount}  {t("个附件")}</small>}
        {message.busy && <small role="status">{t("正在发送…")}</small>}
        {message.error && <small role="alert" className="chat-queue-error">{t(message.error)}</small>}
      </div>
      <button type="button" disabled={disabled || sending} onPointerDown={(event) => event.preventDefault()}
        onClick={() => void act('queueSendNow', message.id)}>{t("立即发送")}</button>
      <button type="button" aria-label={t("删除待发送消息")} disabled={disabled || message.busy}
        onPointerDown={(event) => event.preventDefault()} onClick={() => void act('queueRemove', message.id)}>
        <Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ul>
  </section>;
}
