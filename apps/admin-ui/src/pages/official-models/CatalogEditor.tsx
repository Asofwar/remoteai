import { useState } from "react";
import { Alert, Segmented, Space, Typography } from "antd";
import { JsonEditor } from "../../components/json-editor/JsonEditor";
import { ModelsTable } from "./ModelsTable";
import { catalogErrorMessage, type CatalogDraft } from "./catalog";

interface Props {
  draft: string;
  onChange: (value: string) => void;
  parsed: CatalogDraft;
  disabled: boolean;
  canManage: boolean;
  zh: boolean;
}

export function CatalogEditor({ draft, onChange, parsed, disabled, canManage, zh }: Props) {
  const [mode, setMode] = useState<"table" | "json">("table");
  const activeMode = parsed.catalog ? mode : "json";
  return <Space direction="vertical" size="middle" style={{ display: "flex", minWidth: 0 }}>
    <Space wrap>
      <Typography.Text strong>{zh ? "模型列表" : "Model list"}</Typography.Text>
      <Segmented value={activeMode} onChange={setMode} options={[
        { label: zh ? "表格编辑" : "Table", value: "table", disabled: !parsed.catalog },
        { label: zh ? "JSON 编辑" : "JSON", value: "json" },
      ]} />
    </Space>
    {activeMode === "table" && parsed.catalog ? <>
      <Typography.Text type="secondary">{zh ? "展开模型可编辑全部字段。修改完成后，点击“保存修改”。"
        : "Expand a model to edit all its fields. Click Save changes when finished."}</Typography.Text>
      <ModelsTable catalog={parsed.catalog} onChange={(catalog) => onChange(JSON.stringify(catalog, null, 2))}
        disabled={disabled} canManage={canManage} zh={zh} />
    </> : <JsonEditor value={draft} onChange={onChange} readOnly={disabled} zh={zh}
      label={zh ? "模型列表内容" : "Model list content"} />}
    {parsed.error && <Alert type="error" showIcon message={catalogErrorMessage(parsed.error, zh)} />}
  </Space>;
}
