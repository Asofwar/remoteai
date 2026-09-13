import { useEffect, useState } from 'react';
import { App, Button, Card, Form, InputNumber, Space, Typography } from 'antd';
import { CHAT_POLICY_FIELDS, type ChatPolicy } from '../../../../shared/remote-chat/policy';
import { useI18n } from '../i18n-context';

interface Props {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  canManage: boolean;
}

const labels = {
  threadPageSize: ['每次加载的会话数', 'Conversations per page'],
  historyPageSize: ['每次加载的历史消息数', 'History messages per page'],
  imageSourceMaxMb: ['添加图片的大小上限（MB）', 'Image upload limit (MB)'],
  imageMaxEdge: ['压缩后图片最长边（像素）', 'Maximum image edge after compression (pixels)'],
  imageTargetKb: ['每张图片压缩至（KB 以内）', 'Compress each image to (KB or less)'],
  filePreviewMaxMb: ['文本文件查看上限（MB）', 'Text file preview limit (MB)'],
  imagePreviewMaxMb: ['图片查看上限（MB）', 'Image viewing limit (MB)'],
  fileDownloadMaxMb: ['文件下载上限（MB）', 'File download limit (MB)'],
} satisfies Record<keyof ChatPolicy, [string, string]>;

export function ChatSettingsPage({ api, canManage }: Props) {
  const { language, t } = useI18n();
  const { message } = App.useApp();
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

  return <div className="page-stack">
    <Typography.Title level={2}>{t('nav.chatSettings')}</Typography.Title>
    <Typography.Paragraph>{zh
      ? '手机 App 和网页使用相同设置。保存后，已连接的设备会在几秒内同步，后续加载、添加图片和下载按新设置执行。'
      : 'The mobile app and web share these settings. Connected devices receive changes within seconds '
        + 'for future loads, image uploads and downloads.'}
    </Typography.Paragraph>
    <Card loading={loading}>
      <Form form={form} layout="vertical" onFinish={save} disabled={!canManage || saving || !loaded}>
        {(Object.keys(CHAT_POLICY_FIELDS) as (keyof ChatPolicy)[]).map((key) => {
          const { min, max } = CHAT_POLICY_FIELDS[key];
          return <Form.Item key={key} name={key} label={labels[key][zh ? 0 : 1]}
            extra={`${min}–${max}`} rules={[{ required: true, type: 'integer', min, max }]}>
            <InputNumber min={min} max={max} precision={0} style={{ width: '100%', maxWidth: 400 }} />
          </Form.Item>;
        })}
        {canManage && <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>}
      </Form>
      {!loaded && <Space><Button onClick={() => setAttempt((value) => value + 1)}>
        {zh ? '重试' : 'Retry'}</Button></Space>}
    </Card>
  </div>;
}
