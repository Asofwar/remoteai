// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { installCodexUsageCostSync } from "./codexUsageCostSync";
import { MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY, saveModelLongContextThreshold } from "./tokenCostLongContext";
import { applyTokenCostPresets } from "./tokenCostPresets";
import bundled from "../data/tokenCostPresets.json";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../pages/providers/providerUtils", () => ({
  loadStoredModelTokenCosts: () => ({}),
  MODEL_TOKEN_COSTS_EVENT: "test-model-costs", MODEL_TOKEN_COSTS_STORAGE_KEY: "test-model-costs-storage",
}));

afterEach(() => { localStorage.clear(); Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });

it("syncs model thresholds to native summaries without overlapping pending writes", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  let release: (() => void) | undefined;
  vi.mocked(invoke).mockResolvedValue(undefined).mockImplementationOnce(() => new Promise<void>((resolve) => {
    release = resolve;
  }));
  const stop = installCodexUsageCostSync();
  try {
    saveModelLongContextThreshold("gpt-6-sol", 128_000);
    saveModelLongContextThreshold("gpt-6-luna", null);
    applyTokenCostPresets({ ...bundled, models: bundled.models.map((preset) => ({
      ...preset, longContextThresholdTokens: 200_000,
    })) });
    expect(invoke).toHaveBeenCalledTimes(1);
    release?.();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke).toHaveBeenLastCalledWith("set_codex_usage_cost_rates", expect.objectContaining({
      rates: expect.objectContaining({ modelLongContextThresholds: { "gpt-6-sol": 128_000, "gpt-6-luna": null },
        presetCatalog: expect.objectContaining({ models: expect.arrayContaining([
          expect.objectContaining({ model: "gpt-6-sol", longContextThresholdTokens: 200_000 }),
        ]) }),
      }),
    }));
    localStorage.setItem(MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY, JSON.stringify({ "gpt-6-sol": 64_000 }));
    window.dispatchEvent(new StorageEvent("storage", { key: MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY }));
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    expect(invoke).toHaveBeenLastCalledWith("set_codex_usage_cost_rates", expect.objectContaining({
      rates: expect.objectContaining({ modelLongContextThresholds: { "gpt-6-sol": 64_000 } }),
    }));
  } finally { stop?.(); }
  saveModelLongContextThreshold("gpt-6-sol", null);
  expect(invoke).toHaveBeenCalledTimes(3);
});
