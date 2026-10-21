import { useState } from "react";
import { App, Button, Select } from "antd";
import type { Edge, Graph, Node } from "../types";
import { useT, type Translate } from "../i18n";
import { connectionError, edgeId } from "./graphEditing";

/** One message per branch so the whole button text is translated as a sentence. */
function removeLabel(t: Translate, edge: Edge, target: string): string {
  if (edge.port == null) return t("移除→ {target}", { target });
  return edge.port ? t("移除成立分支→ {target}", { target }) : t("移除不成立分支→ {target}", { target });
}

export function ConnectionEditor({ node, graph, onChange }: {
  node: Node; graph: Graph; onChange: (graph: Graph) => void;
}) {
  const [target, setTarget] = useState<string>();
  const [port, setPort] = useState(true);
  const { message } = App.useApp();
  const t = useT();
  return <details className="connection-controls"><summary>{t("连接到下一步")}</summary>
    <small>{t("也可以拖拽画布上的圆点连接节点。")}</small>
    {node.type === "condition" && <Select className="full" value={String(port)}
      options={[{ value: "true", label: t("条件成立") }, { value: "false", label: t("条件不成立") }]}
      onChange={(value) => setPort(value === "true")} />}
    <Select className="full" placeholder={t("选择要连接的节点")} value={target} onChange={setTarget}
      options={graph.nodes.filter((item) => item.id !== node.id && item.type !== "start")
        .map((item) => ({ value: item.id, label: item.name }))} />
    <Button disabled={!target} onClick={() => {
      if (!target) return;
      const edge = { source: node.id, target, ...(node.type === "condition" ? { port } : {}) };
      const error = connectionError(graph, edge);
      if (error) { void message.info(t(error)); return; }
      onChange({ ...graph, edges: [...graph.edges, edge] }); setTarget(undefined);
    }}>{t("连接")}</Button>
    {graph.edges.filter((edge) => edge.source === node.id).map((edge) => <Button key={edgeId(edge)}
      type="text" danger onClick={() => onChange({ ...graph, edges: graph.edges.filter((item) => item !== edge) })}>
      {removeLabel(t, edge, graph.nodes.find((node) => node.id === edge.target)?.name ?? "")}</Button>)}
  </details>;
}
