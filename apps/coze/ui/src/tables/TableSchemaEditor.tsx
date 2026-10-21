import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Select, Space } from "antd";
import { api, errorText } from "../api";
import { msg, useT } from "../i18n";

interface Column { name: string; kind: string; required: boolean }
interface Schema { columns: Column[]; revision: number }
// Labels are Chinese sources, translated when the options are rendered; values are protocol ids.
const kinds = [
  { value: "string", label: msg("文本") }, { value: "integer", label: msg("整数") }, { value: "number", label: msg("数字") },
  { value: "boolean", label: msg("是 / 否") }, { value: "time", label: msg("日期时间") }, { value: "json", label: msg("对象或数组") },
];

export function TableSchemaEditor({ tableId }: { tableId: string }) {
  const t = useT();
  const [schema, setSchema] = useState<Schema>({ columns: [], revision: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void api<Schema>("table_schema", { id: tableId }).then((value) => { if (active) setSchema(value); })
      .catch((error: unknown) => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [tableId]);
  const update = (columns: Column[]) => { setSchema({ ...schema, columns }); setSaved(false); };
  const save = async () => {
    setBusy(true); setError("");
    try { setSchema(await api<Schema>("save_table_schema", { tableId, ...schema })); setSaved(true); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const kindOptions = kinds.map((kind) => ({ value: kind.value, label: t(kind.label) }));
  return <Space direction="vertical" style={{ width: "100%" }}>
    <p>{t("设置字段后，新记录和已有记录都需要符合字段要求。留空可继续自由填写记录。")}</p>
    {error && <Alert type="error" message={t(error)} />}
    {saved && <Alert type="success" message={t("字段设置已保存。")} />}
    {schema.columns.map((column, index) => <Space key={index} wrap>
      <Input aria-label={t("字段 {index} 名称", { index: index + 1 })} placeholder={t("字段名称")} value={column.name}
        maxLength={64} onChange={(event) => update(schema.columns.map((item, position) => position === index
          ? { ...item, name: event.target.value } : item))} />
      <Select aria-label={t("字段 {index} 类型", { index: index + 1 })} value={column.kind} options={kindOptions}
        style={{ width: 160 }} onChange={(kind: string) => update(schema.columns.map((item, position) => position === index
          ? { ...item, kind } : item))} />
      <Checkbox checked={column.required} onChange={(event) => update(schema.columns.map((item, position) =>
        position === index ? { ...item, required: event.target.checked } : item))}>{t("必填")}</Checkbox>
      <Button danger type="text" onClick={() => update(schema.columns.filter((_, position) => position !== index))}>
        {t("移除")}</Button>
    </Space>)}
    <Space><Button disabled={schema.columns.length >= 100 || busy} onClick={() => update([...schema.columns,
      { name: "", kind: "string", required: false }])}>{t("添加字段")}</Button>
      <Button type="primary" loading={busy} onClick={() => void save()}>{t("保存字段设置")}</Button></Space>
    <small>{t("日期时间请填写为带时区的完整时间，例如 2026-10-11T09:00:00+08:00。")}</small>
  </Space>;
}
