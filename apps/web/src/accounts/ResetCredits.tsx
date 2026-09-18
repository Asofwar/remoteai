import { t, useLanguage } from '../i18n';
import { useRef, useState } from 'react';
import { Button, Dialog, Empty, SpinLoading, Toast } from 'antd-mobile';
import { RefreshCw } from 'lucide-react';
import { consumeResetCredit } from '../api';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import type { AccountSummary } from '../types';
import { displayFullDate, maskEmail } from './formatters';
import type { ResetCreditsState } from './useResetCredits';

export function ResetCredits({ account, state, privateMode, onBack, onUpdated }: {
  account: AccountSummary; state: ResetCreditsState; privateMode: boolean;
  onBack: () => void; onUpdated: () => Promise<void>;
}) {
  useLanguage();
  const [consuming, setConsuming] = useState(false);
  const busy = useRef(false);
  const useCredit = async () => {
    if (busy.current || !state.credits?.length) return;
    busy.current = true;
    const confirmed = await Dialog.confirm({ title: t("确认使用重置卡？"),
      content: t("使用一张重置卡，恢复当前可重置的用量额度。"), confirmText: t("使用重置卡"), cancelText: t("取消") });
    if (!confirmed) { busy.current = false; return; }
    setConsuming(true);
    try {
      await consumeResetCredit(account.id);
      Toast.show({ icon: 'success', content: t("重置卡已使用") });
      await Promise.all([state.reload(), onUpdated()]);
    } catch {
      Toast.show({ icon: 'fail', content: t("使用失败，请稍后重试") });
    } finally { busy.current = false; setConsuming(false); }
  };
  const close = () => { if (!busy.current) onBack(); };
  return <AdaptiveSheet open title={t("重置卡详情")} onClose={close} onBack={close}
    subtitle={privateMode ? maskEmail(account.email) : account.email}>
    <div className="reset-credit-summary"><span>{t("当前可用")}</span>
      <strong>{state.loading || state.error ? '—' : state.credits?.length ?? 0}<small>  {t("张")}</small></strong></div>
    {state.loading ? <div className="sheet-loading"><SpinLoading /><span>{t("正在读取重置卡")}</span></div>
      : state.error ? <div className="detail-load-error" role="alert"><p>{t("重置卡暂时无法读取，请稍后重试")}</p>
        <Button size="small" onClick={() => void state.reload()}>{t("重新读取")}</Button></div>
        : !state.credits?.length ? <Empty description={t("当前没有可用重置卡")} />
          : <div className="reset-credit-list">{state.credits.map((credit, index) =>
            <article key={`${credit.expiresAt}-${index}`}><header><RefreshCw size={20} />
              <strong>{t("重置卡")} {index + 1}</strong><span>{t("可用")}</span></header>
              <p><span>{t("发放时间")}</span>{displayFullDate(credit.issuedAt)}</p>
              <p><span>{t("到期时间")}</span>{displayFullDate(credit.expiresAt)}</p></article>)}</div>}
    <Button block color="primary" loading={consuming} disabled={state.loading || state.error || !state.credits?.length}
      onClick={() => void useCredit()}>{t("使用重置卡")}</Button>
  </AdaptiveSheet>;
}
