import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { Button, Form, Input, SpinLoading, Toast } from 'antd-mobile';
import { Eye, EyeOff, Save } from 'lucide-react';
import { fetchAccountDetails, updateAccountDetails } from '../api';
import type { AccountPrivateDetails, AccountSummary } from '../types';
import { AdaptiveSheet } from './AdaptiveSheet';

interface AccountDetailsSheetProps {
  account: AccountSummary | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

const EMPTY_PRIVATE_DETAILS: AccountPrivateDetails = { password: '', phoneNumber: '', totpSecret: '' };

export function AccountDetailsSheet({ account, onClose, onUpdated }: AccountDetailsSheetProps) {
  useLanguage();
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [privateDetails, setPrivateDetails] = useState(EMPTY_PRIVATE_DETAILS);
  const [hidden, setHidden] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setNote(account.note);
    setExpiresAt(account.expiresAt);
    setPrivateDetails(account.privateDetails ?? EMPTY_PRIVATE_DETAILS);
    setHidden(true);
    setLoading(true);
    setLoadError(false);
    void fetchAccountDetails(account.id).then((details) => {
      if (cancelled) return;
      setNote(details.note);
      setExpiresAt(details.expiresAt);
      setPrivateDetails(details.privateDetails ?? EMPTY_PRIVATE_DETAILS);
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(true);
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("读取账号详情失败") });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.id, revision]);

  const save = async () => {
    if (!account || saving || loading || loadError) return;
    setSaving(true);
    try {
      await updateAccountDetails(account.id, { note, expiresAt, privateDetails });
      Toast.show({ icon: 'success', content: t("账号信息已保存") });
      onClose();
      await onUpdated();
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("保存账号信息失败") });
    } finally {
      setSaving(false);
    }
  };

  return <AdaptiveSheet open={Boolean(account)} title={t("编辑账号信息")} onBack={() => { if (!saving) onClose(); }}
    onClose={() => { if (!saving) onClose(); }}>
    {loading ? <div className="sheet-loading"><SpinLoading color="primary" /><span>{t("正在读取账号详情")}</span></div>
      : loadError ? <div className="detail-load-error" role="alert"><p>{t("账号信息暂时无法读取")}</p>
        <Button onClick={() => setRevision(value => value + 1)}>{t("重新读取")}</Button></div>
        : <Form layout="vertical" className="account-details-form" footer={<Button block color="primary"
          size="large" loading={saving} onClick={() => void save()}><Save size={16} />{t("保存账号信息")}</Button>}>
      <Form.Item label={t("账号备注")}><Input value={note} onChange={setNote} placeholder={t("添加备注")} clearable /></Form.Item>
      <Form.Item label={t("到期时间")}><Input value={expiresAt} onChange={setExpiresAt} placeholder={t("例如 2026-12-31")} clearable /></Form.Item>
      <Form.Item label={t("密码")}><div className="secret-input-row"><Input type={hidden ? 'password' : 'text'} value={privateDetails.password} onChange={(value) => setPrivateDetails((current) => ({ ...current, password: value }))} placeholder={t("可选")} /><button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? t("显示密码") : t("隐藏密码")}>{hidden ? <Eye size={17} /> : <EyeOff size={17} />}</button></div></Form.Item>
      <Form.Item label={t("手机号")}><Input value={privateDetails.phoneNumber} onChange={(value) => setPrivateDetails((current) => ({ ...current, phoneNumber: value }))} placeholder={t("可选")} clearable /></Form.Item>
      <Form.Item label={t("2FA 密钥")}><Input value={privateDetails.totpSecret} onChange={(value) => setPrivateDetails((current) => ({ ...current, totpSecret: value.toUpperCase() }))} placeholder={t("可选")} clearable /></Form.Item>
    </Form>}
  </AdaptiveSheet>;
}
