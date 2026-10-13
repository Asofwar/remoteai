import { Input, InputNumber, Switch, Table } from "antd";
import {
  DEFAULT_LONG_CONTEXT_THRESHOLD_TOKENS, MAX_LONG_CONTEXT_THRESHOLD_TOKENS, type TokenCostPreset,
} from "../../../../shared/token-cost-presets";

export interface PricingRow extends TokenCostPreset { key: string }
interface Props {
  rows: PricingRow[];
  onChange: (rows: PricingRow[]) => void;
  disabled: boolean;
  zh: boolean;
}
type NumericField = "input" | "cachedInput" | "output" | "fastModeMultiplier";

export function TokenPricingTable({ rows, onChange, disabled, zh }: Props) {
  const update = (key: string, patch: Partial<PricingRow>) => onChange(rows.map(
    (row) => row.key === key ? { ...row, ...patch } : row,
  ));
  const price = (row: PricingRow, field: NumericField) => <InputNumber
    aria-label={row.model + " " + field} value={row[field]} disabled={disabled}
    min={field === "fastModeMultiplier" ? 0.01 : 0} max={field === "fastModeMultiplier" ? 100 : 1_000_000_000}
    placeholder={zh ? "未公布" : "Not listed"}
    onChange={(value) => update(row.key, { [field]: field === "fastModeMultiplier" ? value : value ?? 0 })} style={{ width: 105 }} />;
  return <Table rowKey="key" dataSource={rows} pagination={false} scroll={{ x: 1300 }} size="small"
    columns={[
      { title: zh ? "模型" : "Model", key: "model", width: 190, render: (_, row) => <Input
        value={row.model} disabled={disabled} aria-label={zh ? "模型名称" : "Model name"}
        onChange={(event) => update(row.key, { model: event.target.value.trim().toLowerCase() })} /> },
      { title: zh ? "别名（逗号分隔）" : "Aliases (comma separated)", key: "aliases", width: 190,
        render: (_, row) => <Input defaultValue={(row.aliases ?? []).join(", ")} disabled={disabled}
          aria-label={row.model + " aliases"} onBlur={(event) => update(row.key, {
            aliases: event.target.value.split(",").map((alias) => alias.trim().toLowerCase()).filter(Boolean),
          })} /> },
      { title: zh ? "输入" : "Input", key: "input", render: (_, row) => price(row, "input") },
      { title: zh ? "缓存输入" : "Cached input", key: "cachedInput", render: (_, row) => price(row, "cachedInput") },
      { title: zh ? "输出" : "Output", key: "output", render: (_, row) => price(row, "output") },
      { title: zh ? "长上下文计价" : "Long context", key: "longContext", render: (_, row) => <Switch
        checked={row.longContextPricing} disabled={disabled} aria-label={row.model + " long context"}
        onChange={(value) => update(row.key, { longContextPricing: value })} /> },
      { title: zh ? "长上下文计费起点（Token）" : "Long-context threshold (tokens)", key: "longContextThreshold",
        width: 180, render: (_, row) => <InputNumber value={row.longContextThresholdTokens}
          disabled={disabled || !row.longContextPricing} min={1} max={MAX_LONG_CONTEXT_THRESHOLD_TOKENS}
          precision={0} placeholder={String(DEFAULT_LONG_CONTEXT_THRESHOLD_TOKENS)}
          aria-label={row.model + " longContextThresholdTokens"} style={{ width: 140 }}
          onChange={(value) => update(row.key, { longContextThresholdTokens: value })} /> },
      { title: zh ? "价格来源链接" : "Price source URL", key: "source", width: 190, render: (_, row) => <Input
        value={row.sourceUrl} disabled={disabled} placeholder="https://" aria-label={row.model + " source"}
        onChange={(event) => update(row.key, { sourceUrl: event.target.value.trim() })} /> },
      { title: zh ? "快速模式倍率" : "Fast mode multiplier", key: "fastModeMultiplier",
        render: (_, row) => price(row, "fastModeMultiplier") },
    ]} />;
}
