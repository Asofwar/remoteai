import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { apiJson } from '../api';
import { AdaptiveSheet } from '../components/AdaptiveSheet';

export function PasswordSheet({ onClose }: { onClose: () => void }) {
  useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmation) {
      setError(newPassword !== confirmation ? t("两次输入的新密码不一致") : t("请输入当前密码，并设置至少 8 位的新密码"));
      return;
    }
    setSaving(true);
    try {
      await apiJson('/admin/api/profile/password', { method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }) });
      Toast.show({ icon: 'success', content: t("密码已修改") });
      onClose();
    } catch { setError(t("修改失败，请检查当前密码后重试")); }
    finally { setSaving(false); }
  };
  return <AdaptiveSheet open title={t("修改密码")} subtitle={t("新密码至少 8 位")} width={400}
    onClose={() => { if (!saving) onClose(); }}>
    <Form layout="vertical" footer={<Button block color="primary" loading={saving}
      onClick={() => void save()}>{t("确认修改")}</Button>}>
      <Form.Item label={t("当前密码")}><Input aria-label={t("当前密码")} type="password" autoComplete="current-password"
        value={currentPassword} onChange={setCurrentPassword} /></Form.Item>
      <Form.Item label={t("新密码")}><Input aria-label={t("新密码")} type="password" autoComplete="new-password"
        value={newPassword} onChange={setNewPassword} /></Form.Item>
      <Form.Item label={t("确认新密码")}><Input aria-label={t("确认新密码")} type="password" autoComplete="new-password"
        value={confirmation} onChange={setConfirmation} onEnterPress={() => void save()} /></Form.Item>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
    </Form>
  </AdaptiveSheet>;
}
