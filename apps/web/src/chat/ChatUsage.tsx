import { useEffect, useState } from 'react';
import { useChatUsage } from '../../../../shared/remote-chat/client/useChatUsage';
import { formatCost, formatTokens, usageTrailing, type ReadUsage } from '../../../../shared/remote-chat/usage';
import './chatUsage.css';

export function ChatUsage({ read, active, ready }: { read: ReadUsage; active: boolean; ready: boolean }) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const { usage, error } = useChatUsage(read, active && ready && visible);
  const trailing = usageTrailing(usage);
  const notice = ready ? error || '正在读取今日用量…' : '连接后查看今日用量';
  return <div className="chat-usage" role="group" aria-label="今日用量">
    {usage ? <>
      <span>今日 <strong className="chat-usage-tokens">{formatTokens(usage.totalTokens)} Token</strong></span>
      <span>· 预估 <strong className="chat-usage-cost">{formatCost(usage.estimatedCostUsd)}</strong></span>
      {trailing && <span aria-label={trailing.description}>· {trailing.label}
        <strong className={`chat-usage-${trailing.tone}`}>{trailing.text}</strong></span>}
    </> : <span>{notice}</span>}
  </div>;
}
