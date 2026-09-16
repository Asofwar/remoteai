import { Button } from 'antd-mobile';
import { Clock3, RefreshCw } from 'lucide-react';
import type { AccountSummary } from '../types';
import { maskEmail, remainingPercent, resetLabel, usageTone } from './formatters';

export function AccountCard({ account, privateMode, switching, busy, onOpen, onSwitch }: {
  account: AccountSummary; privateMode: boolean; switching: boolean; busy: boolean;
  onOpen: () => void; onSwitch: () => void;
}) {
  const email = privateMode ? maskEmail(account.email) : account.email;
  const remaining = remainingPercent(account.usage.primary?.remainingPercent);
  const plan = account.plan || 'ChatGPT';
  return <article className={`account-row plan-${plan.toLowerCase()} quota-${usageTone(remaining)}`}>
    <button type="button" className="account-row-main" onClick={onOpen} aria-label={`${email} 的账号信息`}>
      <span className="account-row-identity"><span className="plan-badge">{plan}</span><strong>{email}</strong></span>
      <span className="account-row-meter">
        <span className="quota-track" role="progressbar" aria-label="剩余额度" aria-valuemin={0}
          aria-valuemax={100} aria-valuenow={remaining ?? undefined}
          aria-valuetext={remaining === null ? '用量暂不可用' : `${remaining}%`}>
          <i style={{ width: `${remaining ?? 0}%` }} />
        </span><b>{remaining === null ? '--' : `${remaining}%`}</b>
      </span>
      <span className="account-row-reset"><Clock3 size={15} />
        {remaining === null ? '用量暂不可用' : resetLabel(account.usage.primary?.resetsAt)}</span>
      {account.usage.error && <span className="account-row-error">用量更新失败，请稍后重试</span>}
    </button>
    <Button className="account-switch" loading={switching} disabled={busy} onClick={onSwitch}
      aria-label={`切换到账号 ${email}`}><RefreshCw size={19} /><span>切换</span></Button>
  </article>;
}
