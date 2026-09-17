import { useEffect, useState } from 'react';
import { App, Button, Form, Space, Typography, theme } from 'antd';
import type { ChatPolicy } from '../../../../shared/remote-chat/policy';
import { useI18n } from '../i18n-context';
import { ChatSettingsFields } from './ChatSettingsFields';
import './ChatSettingsPage.css';

interface Props {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  canManage: boolean;
}

export function ChatSettingsPage({ api, canManage }: Props) {
  const { language, t } = useI18n();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<ChatPolicy>();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const zh = language === 'zh';
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<ChatPolicy>('/admin/api/chat-settings').then((policy) => {
      if (!cancelled) { form.setFieldsValue(policy); setLoaded(true); }
    }).catch(() => {
      if (!cancelled) message.error(zh ? '聊天设置加载失败，请重试。' : 'Unable to load chat settings. Please retry.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, form, message, zh, attempt]);

  const save = async (policy: ChatPolicy) => {
    setSaving(true);
    try {
      const saved = await api<ChatPolicy>('/admin/api/chat-settings', {
        method: 'PATCH', body: JSON.stringify(policy),
      });
      form.setFieldsValue(saved);
      message.success(zh ? '聊天设置已保存' : 'Chat settings saved');
    } catch { message.error(zh ? '保存失败，请稍后重试。' : 'Unable to save. Please try again.'); }
    finally { setSaving(false); }
  };

  return <div className="chat-policy-page">
    <div className="chat-policy-heading">
      <Typography.Title level={2}>{t('nav.chatSettings')}</Typography.Title>
      <Typography.Text type="secondary">{zh
        ? '统一管理 Codex GUI、手机 App 和网页的聊天设置。各项设置的生效时间见下方说明。'
        : 'Manage chat settings for Codex GUI, mobile and web. See each section for when changes take effect.'}
      </Typography.Text>
      <Typography.Text type="secondary">{zh
        ? '传输大小和图片压缩设置仅用于 Relay，P2P 直连不受这些限制。'
        : 'Transfer size and image compression settings apply to Relay only. P2P transfers are unrestricted.'}
      </Typography.Text>
    </div>
    <Form form={form} onFinish={save} disabled={!canManage || saving || !loaded}>
      <ChatSettingsFields zh={zh} loading={loading} />
      <div className="chat-policy-actions"
        style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}>
        <Typography.Text type="secondary">{zh ? '修改后保存，即可应用新设置。' : 'Save to apply your changes.'}</Typography.Text>
        <Space>
          {!loaded && !loading && <Button onClick={() => setAttempt((value) => value + 1)} disabled={false}>
            {zh ? '重新加载' : 'Reload'}</Button>}
          {canManage && <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>}
        </Space>
      </div>
    </Form>
  </div>;
}
