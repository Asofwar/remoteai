import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Button, SpinLoading, Toast } from 'antd-mobile';
import { RefreshCw } from 'lucide-react';
import { fetchAccountDetails } from '../api';
import { useAppDispatch, useAppSelector } from '../hooks';
import { refreshOneAccount } from '../store';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { AccountDetailsSheet } from '../components/AccountDetailsSheet';
import type { AccountSummary, RemoteDevice } from '../types';
import { AccountInfo } from './AccountInfo';
import { AccountUsage } from './AccountUsage';
import { ResetCredits } from './ResetCredits';
import { useResetCredits } from './useResetCredits';
import { maskEmail } from './formatters';

export function AccountDetails({ account, devices, privateMode, onClose, onUpdated }: {
  account: AccountSummary; devices: RemoteDevice[]; privateMode: boolean;
  onClose: () => void; onUpdated: () => Promise<void>;
}) {
  useLanguage();
  const dispatch = useAppDispatch();
  const refreshing = useAppSelector(s => s.data.refreshingAccountId === account.id);
  const [panel, setPanel] = useState<'overview' | 'edit' | 'note' | 'credits'>('overview');
  const [details, setDetails] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const credits = useResetCredits(account.id);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchAccountDetails(account.id).then(value => {
      if (!cancelled) setDetails(value);
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account.id, revision]);
  const current = details ? { ...account, ...details, usage: account.usage, plan: account.plan } : account;
  const active = devices.filter(device => !device.activeProviderId && device.activeAccountId === account.id);
  const refresh = async () => {
    if (refreshing) return;
    void credits.reload();
    try {
      await dispatch(refreshOneAccount(account.id)).unwrap();
      Toast.show({ icon: 'success', content: t("用量已刷新") });
    } catch { /* The global toast reports the failure. */ }
  };
  const back = () => setPanel('overview');
  return <>
    <AdaptiveSheet open={panel === 'overview'} title={t("账号详情")} subtitle={t("查看账号的使用情况与配置信息")}
      onClose={onClose} width={620}>
      <div className="account-details">
        <div className="account-detail-identity"><span className="account-avatar">
          {account.email.slice(0, 2).toUpperCase()}</span><div>
          <h2>{privateMode ? maskEmail(account.email) : account.email}</h2>
          <p>{active.length ? t("{value1} 正在使用", { value1: active.map(device => device.name).join('、') }) : t("当前没有设备使用此账号")}</p>
          <span className="plan-badge">{account.plan || 'ChatGPT'}</span></div>
          <button type="button" disabled={refreshing} onClick={() => void refresh()} aria-label={t("刷新账号状态")}>
            <RefreshCw size={24} className={refreshing ? 'spin' : ''} /><span>{t("刷新状态")}</span></button></div>
        <AccountUsage usage={account.usage} refreshing={refreshing} onRefresh={() => void refresh()} />
        {loading ? <div className="sheet-loading"><SpinLoading /><span>{t("正在读取账号信息")}</span></div>
          : loadError ? <div className="detail-load-error" role="alert"><p>{t("账号信息暂时无法读取")}</p>
            <Button size="small" onClick={() => setRevision(value => value + 1)}>{t("重新读取")}</Button></div>
            : panel === 'overview' && <AccountInfo account={current} credits={credits}
              onEdit={() => setPanel('edit')} onNote={() => setPanel('note')} onCredits={() => setPanel('credits')} />}
      </div>
    </AdaptiveSheet>
    <AccountDetailsSheet account={panel === 'edit' ? current : null} onClose={back} onUpdated={async () => {
      setRevision(value => value + 1); await onUpdated();
    }} />
    <AdaptiveSheet open={panel === 'note'} title={t("账号备注")} onClose={back} onBack={back} width={400}>
      <p className="account-full-note">{current.note || t("还没有备注")}</p>
    </AdaptiveSheet>
    {panel === 'credits' && <ResetCredits account={current} state={credits} privateMode={privateMode}
      onBack={back} onUpdated={onUpdated} />}
  </>;
}
