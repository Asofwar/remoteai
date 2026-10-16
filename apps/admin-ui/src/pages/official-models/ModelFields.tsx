import { useState } from "react";
import { Input, Table } from "antd";
import { ValueEditor } from "./ValueEditor";
import type { JsonObject } from "./catalog";

interface Props {
  model: JsonObject;
  onChange: (patch: JsonObject) => void;
  disabled: boolean;
  zh: boolean;
}

export function ModelFields({ model, onChange, disabled, zh }: Props) {
  const [search, setSearch] = useState("");
  const fields = Object.entries(model).filter(([field]) => field.toLowerCase().includes(search.toLowerCase()));
  return <div style={{ padding: "8px 0" }}>
    <Input.Search value={search} onChange={(event) => setSearch(event.target.value)} allowClear
      aria-label={zh ? "搜索字段" : "Search fields"} placeholder={zh ? "搜索字段" : "Search fields"}
      style={{ maxWidth: 320, marginBottom: 12 }} />
    <Table size="small" rowKey="field" pagination={false} scroll={{ y: 480, x: 650 }}
      dataSource={fields.map(([field, value]) => ({ field, value }))} columns={[
        { title: zh ? "字段" : "Field", dataIndex: "field", width: 300,
          render: (field: string) => <code style={{ overflowWrap: "anywhere" }}>{field}</code> },
        { title: zh ? "值" : "Value", key: "value", render: (_, { field, value }) => <ValueEditor
          value={value} label={field} disabled={disabled} zh={zh} onChange={(next) => onChange({ [field]: next })} /> },
      ]} />
  </div>;
}
