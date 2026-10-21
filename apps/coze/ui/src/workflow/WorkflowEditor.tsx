import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, List, Space, Upload } from "antd";
import { FileUp, History, Play, Square } from "lucide-react";
import { api, errorText } from "../api";
import type { Draft, Graph, Json, Model, Resource } from "../types";
import { formatDateTime, msg, useT } from "../i18n";
import { Canvas } from "./Canvas";
import { NodeInspector } from "./NodeInspector";
import { useGraphHistory } from "./useGraphHistory";
import { RunResult } from "./RunResult";
import { useWorkflowExecution, type Run } from "./useWorkflowExecution";

interface Props {
  resource: Resource; resources: Resource[]; draft: Draft; onChange: (draft: Draft) => void;
  save?: () => Promise<Resource>;
}

export function WorkflowEditor({ resource, resources, draft, onChange, save }: Props) {
  const t = useT();
  const graph = draft as unknown as Graph;
  const [selected, setSelected] = useState<string>();
  const [models, setModels] = useState<Model[]>([]);
  // Sample input: only the value is localized, once; the field name "text" stays.
  const [input, setInput] = useState(() => JSON.stringify({ text: t("你好") }));
  const [runs, setRuns] = useState<Run[]>([]);
  const [panel, setPanel] = useState<"run" | "history">();
  const execution = useWorkflowExecution();
  const { run, busy, error, setError } = execution;
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState(false);
  const [modelError, setModelError] = useState("");
  useEffect(() => {
    void api<Model[]>("models").then(setModels).catch((error: unknown) => setModelError(errorText(error)));
  }, []);
  const history = useGraphHistory(graph, (next) => onChange(next as unknown as Draft));
  const { change } = history;
  const execute = async () => {
    setSaving(true); setError("");
    try {
      const value: unknown = JSON.parse(input);
      if (save) await save();
      await execution.start("run_start", { resourceId: resource.id, input: value, published: false });
    } catch (error) { setError(error instanceof SyntaxError ? msg("请填写有效的 JSON 输入。") : errorText(error)); }
    finally { setSaving(false); }
  };
  const resume = (runId: string, interactionId: string, input: Json) => {
    setPanel("run"); void execution.start("resume_run_start", { runId, interactionId, input });
  };
  const importCanvas = async (file: File) => {
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error(msg("文件过大，请选择较小的工作流。"));
      const canvas: unknown = JSON.parse(await file.text());
      const graph = await api<Graph>("import_workflow", { canvas });
      change(graph); setSelected(undefined); setImported(true); setError("");
    } catch (error) { setError(error instanceof SyntaxError ? msg("文件内容无法读取，请检查后重试。") : errorText(error)); }
    return false;
  };
  const node = graph.nodes.find((node) => node.id === selected);
  return <div className="workflow-editor">
    <div className="workflow-toolbar"><Space>
      <Upload accept=".json" showUploadList={false} beforeUpload={importCanvas}>
        <Button icon={<FileUp size={15} />}>{t("导入画布")}</Button></Upload>
    </Space><Space>
      <Button icon={<History size={15} />} onClick={() => {
        setPanel("history"); void api<Run[]>("runs", { id: resource.id }).then(setRuns)
          .catch((error: unknown) => setError(errorText(error)));
      }}>{t("运行记录")}</Button>
      <Button type="primary" icon={<Play size={15} />} onClick={() => setPanel("run")}>{t("试运行")}</Button>
    </Space></div>
    {modelError && <Alert type="info" message={t(modelError)} closable onClose={() => setModelError("")} />}
    {imported && <Alert type="info" message={t("画布已导入，请检查所用模型和输入内容后保存。")}
      closable onClose={() => setImported(false)} />}
    {error && !panel && <Alert type="error" message={t(error)} closable onClose={() => setError("")} />}
    <div className="workflow-workspace"><Canvas graph={graph} selected={selected} onSelect={setSelected}
      onChange={change} history={history} />
      {node && <NodeInspector key={node.id} node={node} graph={graph} resources={resources} models={models}
        onChange={change} onClose={() => setSelected(undefined)} />}
    </div>
    <Drawer title={panel === "run" ? t("试运行") : t("运行记录")} open={Boolean(panel)}
      onClose={() => setPanel(undefined)} width={540}>
      {error && <Alert type="error" message={t(error)} />}
      {panel === "run" ? <><p>{t("填写工作流的输入内容。")}</p><Input.TextArea aria-label={t("工作流输入")} rows={5}
        value={input} onChange={(event) => setInput(event.target.value)} />
        <Space className="run-button"><Button type="primary" loading={busy || saving}
          onClick={() => void execute()}>{t("开始运行")}</Button>
          {busy && <Button icon={<Square size={14} />} onClick={() => void execution.cancel()}>{t("停止")}</Button>}</Space>
        {busy && <><pre aria-live="polite">{execution.text || t("正在运行…")}</pre>
          {execution.trace.map((trace, index) => <pre key={index}>{JSON.stringify(trace, null, 2)}</pre>)}</>}
        {run && <RunResult run={run} busy={busy} onResume={resume} />}</> : <List dataSource={runs} renderItem={(item) =>
          <List.Item><details><summary>{item.createdAt && formatDateTime(item.createdAt)}</summary>
            <RunResult run={item} busy={busy} onResume={resume} /></details></List.Item>} />}
    </Drawer>
  </div>;
}
