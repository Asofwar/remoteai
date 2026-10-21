import { Select, Space, Tag } from "antd";
import type { Draft, Resource } from "../types";
import { useKindCopy, useT } from "../i18n";
import { AgentPreview } from "../agents/AgentPreview";
import { SharedWorkflow } from "./SharedWorkflow";

interface Props {
  resource: Resource; resources: Resource[]; draft: Draft;
  onChange: (draft: Draft) => void; save?: () => Promise<Resource>;
}

export function AppEditor({ resource, resources, draft, onChange, save }: Props) {
  const t = useT();
  const copy = useKindCopy();
  const members = Array.isArray(draft.resourceIds) ? draft.resourceIds.map(String) : [];
  const entry = resources.find((item) => item.id === draft.entryId);
  const candidates = resources.filter((item) => item.kind !== "app");
  return <div className="settings-panel">
    <h3>{t("应用内容")}</h3><p>{t("将智能体、工作流与资料组合成一个可以发布的应用。")}</p>
    <Select mode="multiple" style={{ width: "100%" }} placeholder={t("选择应用使用的内容")} value={members}
      options={candidates.map((item) => ({ value: item.id, label: `${copy[item.kind].item} · ${item.name}` }))}
      onChange={(resourceIds: string[]) => onChange({ ...draft, resourceIds,
        entryId: resourceIds.includes(String(draft.entryId)) ? draft.entryId : "" })} />
    <h3>{t("应用入口")}</h3>
    <Select style={{ minWidth: 260 }} placeholder={t("选择智能体或工作流")} value={String(draft.entryId) || undefined}
      options={candidates.filter((item) => members.includes(item.id) && ["agent", "workflow"].includes(item.kind))
        .map((item) => ({ value: item.id, label: item.name }))}
      onChange={(entryId: string) => onChange({ ...draft, entryId })} />
    <p>{t("发布前，请先发布应用引用的内容。发布后会固定这些内容的版本，知识库资料和表中数据可继续更新。")}</p>
    <Space wrap>{candidates.filter((item) => members.includes(item.id)).map((item) =>
      <Tag key={item.id} color={item.publishedRevision ? "green" : "orange"}>
        {item.name} · {item.publishedRevision
          ? t("版本 {revision}", { revision: item.publishedRevision }) : t("待发布")}</Tag>)}</Space>
    <h3>{t("试运行")}</h3>
    {entry?.kind === "agent" && <AgentPreview key={`${resource.id}-${entry.id}`} resource={entry}
      draft={entry.draft} save={save} />}
    {entry?.kind === "workflow" && <SharedWorkflow key={`${resource.id}-${entry.id}`} resourceId={entry.id}
      published={false} save={save} />}
  </div>;
}
