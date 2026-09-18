import { t, useLanguage } from '../i18n';
import { useMemo, useState } from 'react';
import { SpinLoading } from 'antd-mobile';
import { ChevronRight, Copy, Eye, EyeOff, Pencil, UserRound } from 'lucide-react';
import type { AccountSummary, TotpEntry } from '../types';
import { copyText } from '../components/copyText';
import { useTotpCodes } from '../totp/useTotpCodes';
import { earliestExpirationDate } from './formatters';
import type { ResetCreditsState } from './useResetCredits';

function InfoRow({ label, value, copy = false, secret = false }: {
  label: string; value?: string | null; copy?: boolean; secret?: boolean;
}) {
  useLanguage();
  const [hidden, setHidden] = useState(true);
  return <div className="account-info-row"><span>{label}</span>
    <strong>{value ? (secret && hidden ? '••••••••' : value) : t("未设置")}</strong>
    {secret && value && <button className="icon-button" type="button" onClick={() => setHidden(v => !v)}
      aria-label={hidden ? t("显示密码") : t("隐藏密码")}>{hidden ? <Eye size={17} /> : <EyeOff size={17} />}</button>}
    {copy && value && <button className="icon-button" type="button" aria-label={t("复制{value1}", { value1: label })}
      onClick={() => void copyText(label, value)}><Copy size={17} /></button>}
  </div>;
}

function AccountTotp({ secret }: { secret: string }) {
  useLanguage();
  const entries = useMemo<TotpEntry[]>(() => secret ? [{ id: 'preview', secret, issuer: 'ChatGPT',
    accountName: '', algorithm: 'SHA1', digits: 6, period: 30, createdAt: '', updatedAt: '' }] : [], [secret]);
  const { codes, now } = useTotpCodes(entries);
  const code = codes.preview;
  return <div className="account-info-row"><span>2FA</span>
    <button type="button" className="account-inline-code" disabled={!code} aria-label={t("复制当前验证码")}
      onClick={() => void copyText(t("验证码"), code)}>{secret ? (code || t("暂不可用")) : t("未设置")}
      {code && <Copy size={16} />}</button>
    {code && <small>{30 - Math.floor(now / 1000) % 30}  {t("秒")}</small>}
  </div>;
}

export function AccountInfo({ account, credits, onEdit, onNote, onCredits }: {
  account: AccountSummary; credits: ResetCreditsState;
  onEdit: () => void; onNote: () => void; onCredits: () => void;
}) {
  useLanguage();
  const details = account.privateDetails;
  const expiration = earliestExpirationDate(account.expiresAt, account.usage.apiExpiresAt);
  return <section className="account-detail-section">
    <header><UserRound size={19} /><h3>{t("账号信息")}</h3><button className="icon-button" type="button"
      aria-label={t("编辑账号信息")} onClick={onEdit}><Pencil size={20} /></button></header>
    <InfoRow label={t("套餐")} value={account.plan || 'ChatGPT'} />
    <InfoRow label={t("到期时间")} value={expiration} />
    {account.expiresAt && expiration !== account.expiresAt && <InfoRow label={t("预设截止")} value={account.expiresAt} />}
    <InfoRow label={t("账号 ID")} value={account.accountId} copy />
    <InfoRow label={t("手机号")} value={details?.phoneNumber} copy />
    <InfoRow label={t("密码")} value={details?.password} secret copy />
    <AccountTotp secret={details?.totpSecret ?? ''} />
    <button type="button" className="account-info-row" onClick={onNote} aria-label={t("查看完整备注")}>
      <span>{t("备注")}</span><strong className="truncate">{account.note || t("未设置")}</strong><ChevronRight size={17} /></button>
    <button type="button" className="account-info-row" onClick={onCredits} aria-label={t("查看重置卡详情")}>
      <span>{t("重置卡")}</span><strong>{credits.loading ? <SpinLoading style={{ '--size': '16px' }} />
        : credits.credits ? t("{value1} 张", { value1: credits.credits.length }) : t("暂不可用")}</strong><ChevronRight size={17} /></button>
  </section>;
}
