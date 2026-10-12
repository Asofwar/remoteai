import { Button, Card, InputNumber, Space, Switch, Tag, Typography } from "antd";
import { MAX_MODEL_REFRESH_MINUTES, useModelRefreshSettings } from "../hooks/useModelRefreshSettings";
import type { OfficialModelsProps } from "../hooks/useOfficialModels";

export function OfficialModelRefreshSettings({ api, canManage, zh }: OfficialModelsProps & { zh: boolean }) {
  const settings = useModelRefreshSettings(api, zh);
  const busy = settings.loading || settings.saving;
  const editable = canManage && !busy && Boolean(settings.saved);
  return <Card title={zh ? "自动更新" : "Automatic updates"} loading={settings.loading}
    extra={<Button disabled={busy} onClick={settings.reload}>{zh ? "重新加载设置" : "Reload settings"}</Button>}>
    {settings.saved && <Typography.Paragraph>
      <Tag color={settings.saved.enabled ? "green" : "default"}>{settings.saved.enabled
        ? (zh ? `每 ${settings.saved.intervalMinutes} 分钟更新` : `Every ${settings.saved.intervalMinutes} minutes`)
        : (zh ? "已关闭" : "Off")}</Tag>
    </Typography.Paragraph>}
    <Typography.Paragraph type="secondary">{zh
      ? "关闭后保留现有列表，仍可随时手动刷新。更新失败或返回空列表时，也会保留现有内容。"
      : "Turning this off keeps the current list. You can still refresh manually. "
        + "Failed or empty updates keep existing models."}
    </Typography.Paragraph>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap><Typography.Text>{zh ? "自动从官方更新" : "Update automatically"}</Typography.Text>
        <Switch aria-label={zh ? "自动从官方更新" : "Update automatically"} checked={settings.enabled}
          disabled={!editable} onChange={settings.setEnabled} />
      </Space>
      <Space wrap><Typography.Text>{zh ? "更新间隔" : "Update interval"}</Typography.Text>
        <InputNumber aria-label={zh ? "更新间隔（分钟）" : "Update interval (minutes)"} value={settings.intervalMinutes}
          min={1} max={MAX_MODEL_REFRESH_MINUTES} step={1} addonAfter={zh ? "分钟" : "minutes"}
          disabled={!editable || !settings.enabled} onChange={settings.setIntervalMinutes} style={{ width: 210 }} />
      </Space>
      <Typography.Text type="secondary">{zh
        ? "支持 1 分钟至 7 天。保存设置或模型列表后，按所设间隔重新计时。"
        : "Choose 1 minute to 7 days. Saving settings or models restarts the interval."}
      </Typography.Text>
      {canManage && <Button type="primary" loading={settings.saving}
        disabled={!editable || !settings.valid || !settings.dirty} onClick={() => void settings.save()}>
        {zh ? "保存更新设置" : "Save update settings"}</Button>}
    </Space>
  </Card>;
}
