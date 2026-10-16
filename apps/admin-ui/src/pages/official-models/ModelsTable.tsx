import { useState } from "react";
import { Button, Popconfirm, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ModelFields } from "./ModelFields";
import { ValueEditor } from "./ValueEditor";
import { addModel, removeModel, updateModel, type JsonObject, type ModelCatalog } from "./catalog";

interface Props {
  catalog: ModelCatalog;
  onChange: (catalog: ModelCatalog) => void;
  disabled: boolean;
  canManage: boolean;
  zh: boolean;
}
interface ModelRow { index: number; model: JsonObject }

function visibilityOptions(current: string | undefined, zh: boolean) {
  const labels: Record<string, string> = { list: zh ? "显示" : "Visible", hide: zh ? "隐藏" : "Hidden" };
  return [...new Set(["list", "hide", ...(current ? [current] : [])])]
    .map((value) => ({ value, label: labels[value] ?? value }));
}

export function ModelsTable({ catalog, onChange, disabled, canManage, zh }: Props) {
  const [expanded, setExpanded] = useState<readonly React.Key[]>([]);
  const update = (index: number, patch: JsonObject) => onChange(updateModel(catalog, index, patch));
  const field = (row: ModelRow, key: string, fallback: "string" | "number" = "string") => <ValueEditor
    value={row.model[key]} fallback={fallback} label={`${row.index + 1} ${key}`} disabled={disabled}
    zh={zh} onChange={(value) => update(row.index, { [key]: value })} />;
  const columns: ColumnsType<ModelRow> = [
    { title: zh ? "模型标识" : "Model ID", key: "id", width: 200,
      render: (_, row) => field(row, "slug" in row.model || !("id" in row.model) ? "slug" : "id") },
    { title: zh ? "显示名称" : "Display name", key: "name", width: 180,
      render: (_, row) => field(row, "display_name") },
    { title: zh ? "描述" : "Description", key: "description", width: 260,
      render: (_, row) => field(row, "description") },
    { title: zh ? "上下文窗口" : "Context window", key: "context", width: 155,
      render: (_, row) => field(row, "context_window", "number") },
    { title: zh ? "可见性" : "Visibility", key: "visibility", width: 120,
      render: (_, { index, model }) => typeof model.visibility === "string" || model.visibility === undefined
        ? <Select aria-label={`${index + 1} visibility`} style={{ width: "100%" }} disabled={disabled}
          value={model.visibility} placeholder={zh ? "未设置" : "Not set"}
          options={visibilityOptions(model.visibility, zh)}
          onChange={(value) => update(index, { visibility: value })} />
        : field({ index, model }, "visibility") },
  ];
  if (canManage) columns.push({ title: zh ? "操作" : "Actions", key: "actions", width: 90,
    render: (_, { index }) => <Popconfirm title={zh ? "从列表中移除此模型？" : "Remove this model from the list?"}
      styles={{ body: { maxWidth: 400, whiteSpace: "normal" } }} disabled={disabled}
      okText={zh ? "移除" : "Remove"} cancelText={zh ? "取消" : "Cancel"}
      onConfirm={() => { setExpanded([]); onChange(removeModel(catalog, index)); }}>
      <Button danger type="text" disabled={disabled}>{zh ? "移除" : "Remove"}</Button>
    </Popconfirm> });
  return <>
    <Table<ModelRow> rowKey="index" size="small" columns={columns} pagination={false} scroll={{ x: 1100 }}
      dataSource={catalog.models.map((model, index) => ({ model, index }))}
      expandable={{ expandedRowKeys: expanded, onExpandedRowsChange: setExpanded,
        columnTitle: zh ? "详情" : "Details", columnWidth: 64,
        expandedRowRender: ({ index, model }) => <ModelFields model={model} disabled={disabled} zh={zh}
          onChange={(patch) => update(index, patch)} /> }} />
    {canManage && <Button style={{ marginTop: 12 }} disabled={disabled} onClick={() => onChange(addModel(catalog))}>
      {zh ? "添加模型" : "Add model"}</Button>}
  </>;
}
