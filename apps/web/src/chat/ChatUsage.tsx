import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { useChatUsage } from '../../../../shared/remote-chat/client/useChatUsage';
import { formatCost, formatTokens, usageTrailing, type ReadUsage } from '../../../../shared/remote-chat/usage';
import './chatUsage.css';
import { contextUsageLabel } from './formatters';
import type { ThreadTokenUsage } from './types';

export function ChatUsage({ read, active, ready, tokenUsage, onContextSettings }: {
  read: ReadUsage; active: boolean; ready: boolean; tokenUsage?: ThreadTokenUsage;
  onContextSettings?: () => void;
}) {
  useLanguage();
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const { usage, error } = useChatUsage(read, active && ready && visible);
  const trailing = usageTrailing(usage, t);
  const notice = ready ? (error ? t(error) : t("正在读取今日用量…")) : t("连接后查看今日用量");
  return <div className="chat-usage" role="group" aria-label={t("今日用量")}>
    <span className="chat-usage-context chat-row"><span className="chat-grow">{contextUsageLabel(tokenUsage)}</span>
      {onContextSettings && <button type="button" className="chat-back" aria-label={t("对话上下文设置")}
        disabled={!ready || !active} onClick={onContextSettings}><Settings size={18} /></button>}</span>
    {usage ? <>
      <span>{t("今日")} <strong className="chat-usage-tokens">{formatTokens(usage.totalTokens)} Token</strong></span>
      <span>{t("· 预估")} <strong className="chat-usage-cost">{formatCost(usage.estimatedCostUsd)}</strong></span>
      {trailing && <span aria-label={trailing.description}>· {t(trailing.label)}
        <strong className={`chat-usage-${trailing.tone}`}>{trailing.text}</strong></span>}
    </> : <span>{notice}</span>}
  </div>;
}
