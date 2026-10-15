import { useCallback, useEffect, useState } from 'react';
import { App, Form } from 'antd';
import type { UpdateSharingPolicy } from '../../../../shared/app-update/sharingPolicy';

export interface UpdateSharingSettingsProps {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  canManage: boolean;
}

const ENDPOINT = '/admin/api/update-sharing';

export function useUpdateSharingSettings(api: UpdateSharingSettingsProps['api'], zh: boolean) {
  const [form] = Form.useForm<UpdateSharingPolicy>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    void api<UpdateSharingPolicy>(ENDPOINT).then(policy => {
      if (!cancelled) { form.setFieldsValue(policy); setLoaded(true); }
    }).catch(() => {
      if (!cancelled) message.error(zh ? '下载设置加载失败，请重试。' : 'Unable to load download settings. Please retry.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, form, message, zh, revision]);

  const save = useCallback(async (policy: UpdateSharingPolicy) => {
    setSaving(true);
    try {
      form.setFieldsValue(await api<UpdateSharingPolicy>(ENDPOINT, {
        method: 'PATCH', body: JSON.stringify(policy),
      }));
      message.success(zh ? '下载设置已保存' : 'Download settings saved');
    } catch { message.error(zh ? '保存失败，请稍后重试。' : 'Unable to save. Please try again.'); }
    finally { setSaving(false); }
  }, [api, form, message, zh]);

  return { form, loading, loaded, saving, save, reload: () => setRevision(value => value + 1) };
}
