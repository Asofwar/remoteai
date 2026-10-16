import { useEffect, useRef } from "react";
import { Button, Space, theme } from "antd";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { foldAll, forceParsing, unfoldAll } from "@codemirror/language";
import { editorConfiguration, editorSettings, jsonExtensions } from "./extensions";
import "./json-editor.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  zh: boolean;
  label: string;
}
const FOLD_PARSE_BUDGET_MS = 500;

export function JsonEditor({ value, onChange, readOnly, zh, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const current = useRef({ value, onChange, readOnly, label });
  current.current = { value, onChange, readOnly, label };
  const syncing = useRef(false);
  const { token } = theme.useToken();
  useEffect(() => {
    if (!host.current) return;
    const initial = current.current;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({
      doc: initial.value,
      extensions: jsonExtensions({ readOnly: initial.readOnly, label: initial.label,
        onChange: (next) => { if (!syncing.current) current.current.onChange(next); } }),
    }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = undefined; };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    syncing.current = true;
    try { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }); }
    finally { syncing.current = false; }
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({ effects: editorConfiguration.reconfigure(editorSettings(readOnly, label)) });
  }, [readOnly, label]);

  const format = () => {
    const editor = view.current;
    if (!editor || readOnly) return;
    try {
      const formatted = JSON.stringify(JSON.parse(editor.state.doc.toString()), null, 2);
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: formatted } });
    } catch { /* The inline JSON diagnostic explains why formatting is unavailable. */ }
  };
  const collapse = () => {
    const editor = view.current;
    if (!editor) return;
    // Catalogs contain long instruction strings; finish parsing before looking up fold ranges.
    forceParsing(editor, editor.state.doc.length, FOLD_PARSE_BUDGET_MS);
    foldAll(editor);
  };
  return <div className="json-editor" style={{ color: token.colorText, background: token.colorBgContainer,
    borderColor: token.colorBorder, borderRadius: token.borderRadius }}>
    <Space wrap className="json-editor-toolbar" style={{ borderColor: token.colorBorderSecondary }}>
      <Button size="small" onClick={collapse}>
        {zh ? "全部折叠" : "Collapse all"}</Button>
      <Button size="small" onClick={() => { if (view.current) unfoldAll(view.current); }}>
        {zh ? "全部展开" : "Expand all"}</Button>
      <Button size="small" disabled={readOnly} onClick={format}>{zh ? "格式化" : "Format"}</Button>
    </Space>
    <div ref={host} />
  </div>;
}
