import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, List, Pagination, Popconfirm, Space, Tabs, Upload } from "antd";
import { api, errorText, fileBase64 } from "./api";
import { msg, useT, type Translate } from "./i18n";
import { defaultTableColumns, type Json, type Resource } from "./types";
import { TableSchemaEditor } from "./tables/TableSchemaEditor";
import { TableSqlPanel } from "./tables/TableSqlPanel";

/** Sample row with the default column names of a new table, e.g. `{"名称": "", "内容": ""}`. */
export function sampleRow(t: Translate): string {
  return `{${defaultTableColumns(t).map((column) => `${JSON.stringify(column)}: ""`).join(", ")}}`;
}

export function TableEditor({ resource }: { resource: Resource }) {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; value: Json }[]>([]);
  // The sample is editor content: localized once, like the default columns it matches.
  const [text, setText] = useState(() => sampleRow(t));
  const [editing, setEditing] = useState<string>();
  // Holds the untranslated message (frontend source text or Rust error); translated when rendered.
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const refresh = useCallback(async () => {
    const result = await api<{ items: typeof rows; total: number }>("table_rows_page",
      { id: resource.id, offset: (page - 1) * 20, limit: 20 });
    setRows(result.items); setTotal(result.total);
  }, [resource.id, page]);
  useEffect(() => { void refresh().catch((error: unknown) => setError(errorText(error))); }, [refresh]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      await api("save_table_row", { table_id: resource.id, id: editing, value: JSON.parse(text) as Json });
      setEditing(undefined); await refresh();
    } catch (error) { setError(error instanceof SyntaxError ? msg("请填写有效的 JSON 对象。") : errorText(error)); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    if (file.size > 32 * 1024 * 1024) { setError(msg("请选择不超过 32 MB 的表格。")); return; }
    setBusy(true); setError(""); setImported(0);
    try {
      const result = await api<{ inserted: number }>("import_table_rows", { tableId: resource.id,
        name: file.name, contentBase64: await fileBase64(file) });
      setImported(result.inserted); await refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <section className="panel"><Tabs items={[
    { key: "rows", label: t("数据记录"), children: <>
    {error && <Alert type="error" message={t(error)} />}
    {imported > 0 && <Alert type="success" message={t("已导入 {imported} 条记录。", { imported })} />}
    <Input.TextArea aria-label={t("记录内容")} rows={4} value={text} onChange={(event) => setText(event.target.value)} />
    <Space><Button onClick={() => void save()} loading={busy}>{editing ? t("保存记录") : t("新增记录")}</Button>
      <Upload accept=".csv,.tsv,.xlsx" showUploadList={false} disabled={busy}
        beforeUpload={(file) => { void upload(file); return false; }}><Button disabled={busy}>{t("导入表格")}</Button></Upload>
    </Space><p>{t("表格首行作为字段名称，Excel 导入第一个工作表，每次最多 10,000 条记录。")}</p>
    <List dataSource={rows} renderItem={(row) => <List.Item actions={[
      <Button key="edit" onClick={() => { setEditing(row.id); setText(JSON.stringify(row.value, null, 2)); }}>{t("编辑")}</Button>,
      <Popconfirm key="delete" title={t("确定删除这条记录？")} overlayStyle={{ maxWidth: 400 }} onConfirm={async () => {
        try { await api("delete_table_row", { table_id: resource.id, id: row.id }); await refresh(); }
        catch (error) { setError(errorText(error)); }
      }}><Button danger>{t("删除")}</Button></Popconfirm>,
    ]}><pre>{JSON.stringify(row.value, null, 2)}</pre></List.Item>} />
    <Pagination current={page} pageSize={20} total={total} showSizeChanger={false} onChange={setPage}
      showTotal={(count) => t("共 {count} 条记录", { count })} />
    </> }, { key: "schema", label: t("字段设置"), children: <TableSchemaEditor tableId={resource.id} /> },
    { key: "sql", label: t("查询与分析"), children: <TableSqlPanel resource={resource} /> },
  ]} /></section>;
}
