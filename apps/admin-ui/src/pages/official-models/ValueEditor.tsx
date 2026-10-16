import { useState } from "react";
import { Alert, Button, Input, InputNumber, Modal, Switch } from "antd";
import { JsonEditor } from "../../components/json-editor/JsonEditor";
import type { JsonValue } from "./catalog";

interface Props {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  label: string;
  disabled: boolean;
  zh: boolean;
  fallback?: "string" | "number";
}
const INLINE_TEXT_LIMIT = 160;

function valueSummary(value: JsonValue | undefined, zh: boolean) {
  if (value === undefined) return zh ? "未设置" : "Not set";
  if (value === null) return "null";
  if (typeof value === "string") return zh ? `文本 · ${value.length} 字符` : `Text · ${value.length} characters`;
  const count = Object.keys(value).length;
  if (Array.isArray(value)) return zh ? `列表 · ${count} 项` : `List · ${count} items`;
  return zh ? `对象 · ${count} 个字段` : `Object · ${count} fields`;
}

function ValueDialog({ value, onChange, label, disabled, zh }: Props) {
  const text = typeof value === "string";
  const [draft, setDraft] = useState(text ? value : JSON.stringify(value ?? null, null, 2));
  const [open, setOpen] = useState(false);
  let parsed: JsonValue = draft;
  let valid = true;
  if (!text) {
    try { parsed = JSON.parse(draft) as JsonValue; }
    catch { valid = false; }
  }
  return <>
    <Button block aria-label={`${label} ${zh ? "查看或编辑内容" : "View or edit value"}`}
      onClick={() => { setDraft(text ? value : JSON.stringify(value ?? null, null, 2)); setOpen(true); }}>
      {valueSummary(value, zh)}</Button>
    <Modal title={label} open={open} width={800} destroyOnHidden
      okText={zh ? "应用" : "Apply"} cancelText={zh ? "取消" : "Cancel"}
      okButtonProps={{ disabled: disabled || !valid }} onCancel={() => setOpen(false)}
      onOk={() => { if (valid && !disabled) { onChange(parsed); setOpen(false); } }}>
      {text ? <Input.TextArea aria-label={label} value={draft} readOnly={disabled}
        autoSize={{ minRows: 12, maxRows: 22 }} onChange={(event) => setDraft(event.target.value)} />
        : <JsonEditor value={draft} onChange={setDraft} readOnly={disabled} zh={zh} label={label} />}
      {!valid && <Alert style={{ marginTop: 12 }} type="error" showIcon
        message={zh ? "JSON 格式有误，请检查后再应用。" : "Fix the JSON syntax before applying."} />}
    </Modal>
  </>;
}

export function ValueEditor(props: Props) {
  const { value, onChange, label, disabled, zh, fallback } = props;
  const kind = value == null && fallback ? fallback : typeof value;
  if (kind === "string" && (value == null || (typeof value === "string"
    && value.length <= INLINE_TEXT_LIMIT && !value.includes("\n")))) {
    return <Input aria-label={label} value={(value ?? "") as string} disabled={disabled}
      placeholder={zh ? "未设置" : "Not set"} onChange={(event) => onChange(event.target.value)} />;
  }
  if (kind === "number") return <InputNumber aria-label={label} value={value as number | null | undefined}
    disabled={disabled} style={{ width: "100%" }} onChange={(next) => onChange(next)} />;
  if (typeof value === "boolean") return <Switch aria-label={label} checked={value} disabled={disabled}
    checkedChildren={zh ? "是" : "Yes"} unCheckedChildren={zh ? "否" : "No"} onChange={onChange} />;
  return <ValueDialog {...props} />;
}
