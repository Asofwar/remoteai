import { useEffect, useState } from "react";
import { InputNumber } from "antd";
import { isValidLongContextThreshold, type TokenCostPreset } from "../../../../shared/token-cost-presets";
import type { Translate } from "../i18n";
import {
  LONG_CONTEXT_COST_EVENT, LONG_CONTEXT_COST_STORAGE_KEY, MAX_LONG_CONTEXT_THRESHOLD_TOKENS,
  MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY, modelLongContextThresholdOverride,
  presetLongContextThreshold, saveModelLongContextThreshold,
} from "../utils/tokenCostLongContext";

export function TokenCostModelLongContextSettings({ preset, t }: { preset: TokenCostPreset; t: Translate }) {
  const [value, setValue] = useState(() => modelLongContextThresholdOverride(preset.model));
  const [error, setError] = useState(false);
  useEffect(() => {
    const refresh = () => setValue(modelLongContextThresholdOverride(preset.model));
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY
        || event.key === LONG_CONTEXT_COST_STORAGE_KEY) refresh();
    };
    window.addEventListener(LONG_CONTEXT_COST_EVENT, refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(LONG_CONTEXT_COST_EVENT, refresh);
      window.removeEventListener("storage", storage);
    };
  }, [preset.model]);
  if (!preset.longContextPricing) return <span>—</span>;
  const valid = value === null || isValidLongContextThreshold(value);
  const save = (next: number | null) => {
    setValue(next);
    try { saveModelLongContextThreshold(preset.model, next); setError(false); }
    catch { setError(true); }
  };
  return <div style={{ maxWidth: 180 }}>
    <InputNumber value={value} onChange={save} min={1} max={MAX_LONG_CONTEXT_THRESHOLD_TOKENS} precision={0}
      placeholder={String(presetLongContextThreshold(preset))} style={{ width: 130 }}
      aria-label={t("tokenCost.longContext.modelThreshold", { model: preset.model })}
      aria-invalid={!valid} status={error || !valid ? "error" : undefined} />
    {!valid && <small role="alert">{t("tokenCost.longContext.invalidThreshold", {
      max: MAX_LONG_CONTEXT_THRESHOLD_TOKENS,
    })}</small>}
    {error && <small role="alert">{t("tokenCost.longContext.saveError")}</small>}
  </div>;
}
