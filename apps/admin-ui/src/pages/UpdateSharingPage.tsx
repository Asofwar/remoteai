import { Button, Card, Form, Select, Space, Switch, Typography } from 'antd';
import { useI18n } from '../i18n-context';
import { useUpdateSharingSettings, type UpdateSharingSettingsProps } from '../hooks/useUpdateSharingSettings';
import { UpdateDownloadStatistics } from './UpdateDownloadStatistics';

const UPLOAD_SPEEDS = [0, 64, 128, 256, 512, 1024, 2048, 4096, 8192];

export function UpdateSharingPage({ api, canManage }: UpdateSharingSettingsProps) {
  const { language, t } = useI18n();
  const zh = language === 'zh';
  const settings = useUpdateSharingSettings(api, zh);
  const disabled = !canManage || settings.loading || settings.saving || !settings.loaded;
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <div>
      <Typography.Title level={2}>{t('nav.updateSharing')}</Typography.Title>
      <Typography.Paragraph type="secondary">{zh
        ? '让在线电脑共享公开安装包，帮助电脑和手机下载得更快。设置统一应用于所有用户。'
        : 'Let online computers share public installers to speed up downloads for computers and phones. '
          + 'These settings apply to all users.'}</Typography.Paragraph>
    </div>
    <UpdateDownloadStatistics api={api} />
    <Card title={zh ? '安装包共享' : 'Installer sharing'} loading={settings.loading}>
      <Form form={settings.form} layout="vertical" onFinish={settings.save} disabled={disabled}
        style={{ maxWidth: 560 }}>
        <Form.Item name="scope" label={zh ? '共享范围' : 'Sharing scope'} rules={[{ required: true }]}>
          <Select options={[
            { value: 'off', label: zh ? '关闭' : 'Off' },
            { value: 'own', label: zh ? '我的设备' : 'My devices' },
            { value: 'everyone', label: zh ? '所有用户' : 'All users' },
          ]} />
        </Form.Item>
        <Form.Item name="uploadKibPerSecond" label={zh ? '上传速度上限' : 'Upload speed limit'}
          rules={[{ required: true }]}>
          <Select options={UPLOAD_SPEEDS.map(value => ({ value,
            label: value === 0 ? (zh ? '不限速' : 'Unlimited') : `${value} KiB/s` }))} />
        </Form.Item>
        <Form.Item name="unmeteredOnly" valuePropName="checked"
          label={zh ? '仅在非计费网络上传' : 'Upload only on unmetered networks'}>
          <Switch />
        </Form.Item>
        <Form.Item name="prepareAndroid" valuePropName="checked"
          label={zh ? '提前准备 Android 安装包' : 'Prepare Android installers in advance'}>
          <Switch />
        </Form.Item>
        <Typography.Paragraph type="secondary">{zh
          ? '开启后，在线电脑会提前下载 Android 安装包，供手机更新时使用。'
          : 'Online computers download Android installers in advance so phones can use them when updating.'}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">{zh
          ? '保存后，在线电脑通常会在 30 秒内应用新设置。'
          : 'Online computers usually apply saved changes within 30 seconds.'}</Typography.Paragraph>
        <Space wrap>
          {canManage && <Button type="primary" htmlType="submit" loading={settings.saving}>{t('common.save')}</Button>}
          <Button onClick={settings.reload} disabled={settings.loading || settings.saving}>
            {zh ? '重新加载' : 'Reload'}</Button>
        </Space>
      </Form>
    </Card>
  </Space>;
}
