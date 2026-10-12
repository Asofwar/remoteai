import { Button, Card, Input, Select, Space, Typography } from "antd";
import { useHelpSettings } from "../hooks/useHelpSettings";
import type { OfficialModelsProps } from "../hooks/useOfficialModels";

function modelOptions(catalog: Record<string, unknown> | null | undefined) {
  const models: unknown[] = Array.isArray(catalog?.models) ? catalog.models : [];
  return models.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const model = entry as Record<string, unknown>;
    const value = typeof model.slug === "string" && model.slug ? model.slug : model.id;
    if (typeof value !== "string" || !value.trim() || model.visibility === "hide") return [];
    return [{ value: value.trim(), label: value.trim() }];
  });
}

export function HelpAssistantSettings({ api, canManage, catalog, zh }: OfficialModelsProps & {
  catalog: Record<string, unknown> | null | undefined; zh: boolean;
}) {
  const settings = useHelpSettings(api, zh);
  const options = modelOptions(catalog);
  const busy = settings.loading || settings.saving;
  const editable = canManage && !busy && Boolean(settings.draft);
  const validModel = options.some((option) => option.value === settings.draft?.model);
  return <Card title={zh ? "问题解答助手" : "Help assistant"} loading={settings.loading}
    extra={<Button disabled={busy} onClick={settings.reload}>{zh ? "重新加载" : "Reload"}</Button>}>
    <Typography.Paragraph type="secondary">{zh
      ? "统一设置助手使用的模型和回答方式。用户使用 Codex 中所选账户；三方账户不支持指定模型时会提示错误，不会自动换模型。"
      : "Set the assistant’s model and instructions. It uses the account selected in Codex "
        + "and reports unsupported models without switching."}
    </Typography.Paragraph>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div><Typography.Paragraph>{zh ? "助手模型" : "Assistant model"}</Typography.Paragraph>
        <Select aria-label={zh ? "助手模型" : "Assistant model"} showSearch optionFilterProp="label"
          style={{ width: "100%", maxWidth: 400 }} disabled={!editable} options={options}
          value={settings.draft?.model || undefined}
          placeholder={zh ? "从已缓存的官方模型中选择" : "Choose a cached official model"}
          onChange={(model: string) => settings.setDraft((draft) => draft && { ...draft, model })} />
        {!options.length && <Typography.Paragraph type="secondary">{zh
          ? "暂无可用模型，请先更新下方的官方模型列表。" : "Update the official model list below first."}</Typography.Paragraph>}
        {settings.draft?.model && !validModel && <Typography.Paragraph type="warning">{zh
          ? "已保存的模型不在当前列表中，请重新选择。"
          : "The saved model is no longer listed. Choose another model."}
        </Typography.Paragraph>}
      </div>
      <div><Typography.Paragraph>{zh ? "系统提示词" : "System instructions"}</Typography.Paragraph>
        <Input.TextArea aria-label={zh ? "系统提示词" : "System instructions"}
          value={settings.draft?.systemPrompt ?? ""}
          readOnly={!canManage} disabled={busy || !settings.draft} maxLength={16000} autoSize={{ minRows: 5, maxRows: 12 }}
          onChange={(event) => settings.setDraft((draft) => draft && { ...draft, systemPrompt: event.target.value })} />
      </div>
      {canManage && <Button type="primary" loading={settings.saving}
        disabled={!editable || !validModel || !settings.draft?.systemPrompt.trim()} onClick={() => void settings.save()}>
        {zh ? "保存助手设置" : "Save assistant settings"}</Button>}
    </Space>
  </Card>;
}
