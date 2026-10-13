// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import bundled from "../data/tokenCostPresets.json";

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

async function setup() {
  const presets = await import("./tokenCostPresets");
  const settings = await import("./tokenCostLongContext");
  const model = { ...bundled.models[4], model: "threshold-model", aliases: ["threshold-alias"],
    longContextPricing: true, longContextThresholdTokens: 128_000 };
  expect(presets.applyTokenCostPresets({ ...bundled, models: [model] })).toBe(true);
  return { presets, settings, model };
}

it("uses the remote model threshold, including aliases and reference fallback, across the strict boundary", async () => {
  const { presets, settings } = await setup();
  presets.saveTokenCostReferenceModel("threshold-model");
  for (const model of ["threshold-model", "THRESHOLD-ALIAS", "threshold-model-dated", "unknown-model"]) {
    expect(settings.longContextMultipliersForEntry(model, 128_000).input).toBe(1);
    expect(settings.longContextMultipliersForEntry(model, 128_001)).toEqual({ input: 2, cachedInput: 2, output: 1.5 });
  }
  expect(settings.longContextMultipliersForEntry("gpt-6-sol", 272_000).input).toBe(1);
  expect(settings.longContextMultipliersForEntry("gpt-6-sol", 272_001).input).toBe(2);
  expect(settings.longContextMultipliersForEntry("gpt-5.4-mini", 1_000_000).input).toBe(1);
});

it("preserves local overrides through preset updates and reloads, then clears to the latest preset", async () => {
  const { presets, settings, model } = await setup();
  settings.saveModelLongContextThreshold("threshold-alias", 400_000);
  presets.applyTokenCostPresets({ ...bundled, models: [{ ...model, longContextThresholdTokens: 200_000 }] });
  vi.resetModules();
  const reloaded = await import("./tokenCostLongContext");
  expect(reloaded.longContextMultipliersForEntry(model.model, 300_000).input).toBe(1);
  expect(reloaded.longContextMultipliersForEntry(model.model, 400_001).input).toBe(2);
  reloaded.saveModelLongContextThreshold(model.model, null);
  expect(reloaded.longContextMultipliersForEntry(model.model, 200_000).input).toBe(1);
  expect(reloaded.longContextMultipliersForEntry(model.model, 200_001).input).toBe(2);
});

it("keeps customized legacy thresholds but lets models reset to presets", async () => {
  const { settings } = await setup();
  settings.saveLongContextCostSettings({ ...settings.DEFAULT_LONG_CONTEXT_COST_SETTINGS, outputMultiplier: 3 });
  expect(settings.longContextMultipliersForEntry("threshold-model", 128_001).output).toBe(3);
  settings.saveLongContextCostSettings({ ...settings.DEFAULT_LONG_CONTEXT_COST_SETTINGS, thresholdTokens: 600_000 });
  expect(settings.modelLongContextThresholdOverride("threshold-model")).toBe(600_000);
  settings.saveModelLongContextThreshold("threshold-model", null);
  expect(settings.longContextMultipliersForEntry("threshold-model", 128_001).input).toBe(2);
  expect(settings.modelLongContextThresholdOverride("gpt-6-sol")).toBe(600_000);
});

it("rejects invalid remote thresholds and ignores corrupt local settings", async () => {
  const { presets, settings, model } = await setup();
  for (const threshold of [0, -1, 1.5, 1_000_000_001, "272000", true]) {
    expect(presets.applyTokenCostPresets({ ...bundled,
      models: [{ ...model, longContextThresholdTokens: threshold }] })).toBe(false);
  }
  for (const threshold of [undefined, null, 1, 1_000_000_000]) {
    expect(presets.applyTokenCostPresets({ ...bundled,
      models: [{ ...model, longContextThresholdTokens: threshold }] })).toBe(true);
  }
  localStorage.setItem(settings.MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY,
    JSON.stringify({ bad: 0, fractional: 1.5, valid: 128_000, reset: null }));
  expect(settings.loadModelLongContextThresholds()).toEqual({ valid: 128_000, reset: null });
});

it("applies custom thresholds to the full cached request and stacks Fast pricing", async () => {
  const { settings } = await setup();
  const { estimateTokenCost } = await import("./tokenCost");
  settings.saveModelLongContextThreshold("gpt-6-sol", 100_000);
  const entry = { id: "request", ts: 0, provider: "", model: "gpt-6-sol", inputTokens: 100_000,
    cachedTokens: 50_000, outputTokens: 10_000, serviceTier: "fast" };
  expect(estimateTokenCost(entry, [])).toBeCloseTo(0.42);
  expect(estimateTokenCost({ ...entry, inputTokens: 100_001 }, [])).toBeCloseTo(0.740008);
  settings.saveLongContextCostSettings({ ...settings.DEFAULT_LONG_CONTEXT_COST_SETTINGS, enabled: false });
  expect(estimateTokenCost({ ...entry, inputTokens: 100_001 }, [])).toBeCloseTo(0.420004);
});
