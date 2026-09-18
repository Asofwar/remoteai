import { t, useLanguage } from '../i18n';
import { Tooltip } from 'antd';
import { ChartNoAxesColumn, CircleHelp, Clock3, RefreshCw } from 'lucide-react';
import type { UsageSummary, UsageWindow } from '../types';
import { displayDate, remainingPercent, resetLabel, usageTone } from './formatters';

function UsageMeter({ title, usage, secondary }: { title: string; usage?: UsageWindow | null; secondary?: boolean }) {
  useLanguage();
  const remaining = remainingPercent(usage?.remainingPercent);
  return <div className={`detail-meter quota-${usageTone(remaining)} ${secondary ? 'secondary' : ''}`}>
    <div><strong>{title}</strong><Tooltip trigger={['hover', 'click', 'focus']}
      title={t("这里显示剩余额度和重置时间，不同套餐的用量窗口可能不同。")}>
      <button type="button" className="icon-button" aria-label={t("了解{value1}", { value1: title })}><CircleHelp size={15} /></button>
    </Tooltip><b>{remaining === null ? '--' : `${remaining}%`}</b><span>{t("剩余")}</span></div>
    <div className="quota-track" role="progressbar" aria-label={t("{value1}剩余额度", { value1: title })} aria-valuemin={0}
      aria-valuemax={100} aria-valuenow={remaining ?? undefined}
      aria-valuetext={remaining === null ? t("用量暂不可用") : `${remaining}%`}>
      <i style={{ width: `${remaining ?? 0}%` }} /></div>
    <p><Clock3 size={14} />{usage ? resetLabel(usage.resetsAt) : t("用量暂不可用")}</p>
  </div>;
}

export function AccountUsage({ usage, refreshing, onRefresh }: {
  usage: UsageSummary; refreshing: boolean; onRefresh: () => void;
}) {
  useLanguage();
  return <section className="account-detail-section">
    <header><ChartNoAxesColumn size={19} /><h3>{t("使用情况")}</h3><small>{t("更新于")} {displayDate(usage.fetchedAt)}</small>
      <button className="icon-button" type="button" disabled={refreshing} onClick={onRefresh}
        aria-label={t("刷新账号用量")}><RefreshCw size={18} className={refreshing ? 'spin' : ''} /></button></header>
    <UsageMeter title={t("主用量窗口")} usage={usage.primary} />
    <UsageMeter title={t("次用量窗口")} usage={usage.secondary} secondary />
    {usage.error && <p className="account-row-error">{t("用量更新失败，请稍后重试")}</p>}
  </section>;
}
