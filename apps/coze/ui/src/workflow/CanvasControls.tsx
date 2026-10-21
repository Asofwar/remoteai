import { Button, Space, Tooltip } from "antd";
import { Maximize, Minus, Plus, Redo2, Undo2, Workflow } from "lucide-react";
import { Panel, useReactFlow, useViewport } from "@xyflow/react";
import type { Graph } from "../types";
import { useT } from "../i18n";
import { arrangeGraph } from "./graphEditing";

export interface HistoryControls { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }
interface Props { graph: Graph; onChange: (graph: Graph) => void; history: HistoryControls }

export function CanvasControls({ graph, onChange, history }: Props) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const t = useT();
  const controls = [
    { id: "undo", label: t("撤销 (Ctrl+Z)"), Icon: Undo2, disabled: !history.canUndo, action: history.undo },
    { id: "redo", label: t("重做 (Ctrl+Shift+Z)"), Icon: Redo2, disabled: !history.canRedo, action: history.redo },
    { id: "zoom-out", label: t("缩小"), Icon: Minus, action: () => void flow.zoomOut() },
    { id: "zoom-in", label: t("放大"), Icon: Plus, action: () => void flow.zoomIn() },
    { id: "fit", label: t("适应画布"), Icon: Maximize, action: () => void flow.fitView({ padding: 0.2, duration: 200 }) },
    { id: "arrange", label: t("自动整理"), Icon: Workflow, action: () => {
      onChange(arrangeGraph(graph));
      requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 200 }));
    } },
  ];
  return <Panel position="bottom-left" className="canvas-controls"><Space size={2}>
    {controls.map(({ id, label, Icon, action, disabled }) => <Tooltip key={id} title={label}>
      <Button type="text" aria-label={label} disabled={disabled} icon={<Icon size={16} />} onClick={action} />
    </Tooltip>)}<Button type="text" aria-label={t("重置缩放")} onClick={() => void flow.zoomTo(1)}>
      {Math.round(zoom * 100)}%</Button>
  </Space></Panel>;
}
