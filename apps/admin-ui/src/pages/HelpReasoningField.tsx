import { Select, Typography } from "antd";
import type { HelpReasoningEffort } from "../hooks/useHelpSettings";

const EFFORT_LABELS: Record<HelpReasoningEffort, string> = {
  none: "无", minimal: "极低", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高", ultra: "超高",
};

export function HelpReasoningField({ value, disabled, zh, onChange }: {
  value: HelpReasoningEffort | undefined;
  disabled: boolean;
  zh: boolean;
  onChange: (effort: HelpReasoningEffort) => void;
}) {
  return <div>
    <Typography.Paragraph>{zh ? "推理强度" : "Reasoning effort"}</Typography.Paragraph>
    <Select aria-label={zh ? "推理强度" : "Reasoning effort"} value={value} disabled={disabled}
      style={{ width: "100%", maxWidth: 400 }} onChange={onChange}
      options={Object.entries(EFFORT_LABELS).map(([effort, label]) => ({
        value: effort, label: zh ? `${label}（${effort}）` : effort,
      }))} />
    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>{zh
      ? "强度越高，通常需要更长时间。请选择模型支持的强度。"
      : "Higher effort usually takes longer. Choose a level supported by the model."}
    </Typography.Paragraph>
  </div>;
}
