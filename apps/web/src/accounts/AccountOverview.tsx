import { t, useLanguage } from '../i18n';
import { Button } from 'antd-mobile';
import { Clock3, Eye, EyeOff, Laptop, Plus, RefreshCw, Users, Zap } from 'lucide-react';
import { displayDate } from './formatters';

export function AccountOverview({ count, online, privateMode, refreshing, consuming, busy,
  updatedAt, onPrivacy, onRefresh, onConsume, onAdd }: {
  count: number; online: number; privateMode: boolean; refreshing: boolean; updatedAt: number | null;
  consuming: boolean; busy: boolean;
  onPrivacy: () => void; onRefresh: () => void; onConsume: () => void; onAdd: () => void;
}) {
  useLanguage();
  return <>
    <section className="accounts-overview">
      <header><h1>{t("账户管理")}</h1><button className="icon-button" type="button" onClick={onPrivacy}
        aria-label={privateMode ? t("显示账号邮箱") : t("隐藏账号邮箱")} aria-pressed={privateMode}>
        {privateMode ? <EyeOff size={20} /> : <Eye size={20} />}</button></header>
      <div className="accounts-overview-stats">
        <div className="accounts-stat"><Users size={26} /><span><b>{count}</b><small>{t("个账号")}</small></span></div>
        <div className="accounts-stat"><Laptop size={26} /><span><b>{online}</b><small>{t("在线设备")}</small></span></div>
        <div className="accounts-overview-actions">
          <Button className="accounts-consume" loading={consuming} disabled={!count || busy} onClick={onConsume}
            aria-label={t('消耗额度')}><Zap size={23} /><span>{t('消耗额度')}</span></Button>
          <Button color="primary" loading={refreshing} disabled={!count || busy} onClick={onRefresh}
          aria-label={t("批量刷新用量")}>
          <RefreshCw size={18} /><span>{t("批量刷新用量")}</span></Button>
        </div>
      </div>
    </section>
    <div className="accounts-toolbar"><span><Clock3 size={16} />{t("用量更新：")}{updatedAt ? displayDate(new Date(updatedAt).toISOString()) : t("未刷新")}</span>
      <Button fill="none" color="primary" onClick={onAdd}><Plus size={20} />{t("添加账户")}</Button>
    </div>
  </>;
}
