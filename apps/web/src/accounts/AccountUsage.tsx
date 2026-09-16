import { Tooltip } from 'antd';
import { ChartNoAxesColumn, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import type { UsageSummary, UsageWindow } from '../types';
import { displayDate, remainingPercent, resetLabel, usageTone } from './formatters';

function UsageMeter({ title, usage, secondary }: { title: string; usage?: UsageWindow | null; secondary?: boolean }) {
  const remaining = remainingPercent(usage?.remainingPercent);
  return <div className={`detail-meter quota-${usageTone(remaining)} ${secondary ? 'secondary' : ''}`}>
    <div><strong>{title}</strong><Tooltip trigger={['hover', 'click', 'focus']}
      title="这里显示剩余额度和重置时间，不同套餐的用量窗口可能不同。">
      <button type="button" className="icon-button" aria-label={`了解${title}`}><CircleHelp size={15} /></button>
    </Tooltip><b>{remaining === null ? '--' : `${remaining}%`}</b><span>剩余</span></div>
    <div className="quota-track" role="progressbar" aria-label={`${title}剩余额度`} aria-valuemin={0}
      aria-valuemax={100} aria-valuenow={remaining ?? undefined}
      aria-valuetext={remaining === null ? '用量暂不可用' : `${remaining}%`}>
      <i style={{ width: `${remaining ?? 0}%` }} /></div>
    <p><Clock3 size={14} />{usage ? resetLabel(usage.resetsAt) : '用量暂不可用'}</p>
  </div>;
}

export function AccountUsage({ usage, refreshing, onRefresh }: {
  usage: UsageSummary; refreshing: boolean; onRefresh: () => void;
}) {
  return <section className="account-detail-section">
    <header><ChartNoAxesColumn size={19} /><h3>使用情况</h3><small>更新于 {displayDate(usage.fetchedAt)}</small>
      <button className="icon-button" type="button" disabled={refreshing} onClick={onRefresh}
        aria-label="刷新账号用量"><RefreshCw size={18} className={refreshing ? 'spin' : ''} /></button></header>
    <UsageMeter title="主用量窗口" usage={usage.primary} />
    <UsageMeter title="次用量窗口" usage={usage.secondary} secondary />
    {usage.error && <p className="account-row-error">用量更新失败，请稍后重试</p>}
  </section>;
}
