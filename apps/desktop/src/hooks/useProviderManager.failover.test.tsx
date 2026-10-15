// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as backend from "../api/backend";
import { translate, type Translate } from "../i18n";
import { useProviderManager } from "./useProviderManager";

vi.mock("../api/backend", async (original) => ({
  ...await original<typeof backend>(), saveAggregateApiProfile: vi.fn(),
}));
vi.mock("./useProviderData", () => ({ useProviderData: () => ({
  providers: [], aggregateApis: [], localProxy: null, loading: false, load: vi.fn(), setLocalProxy: vi.fn(),
}) }));
const notify = vi.fn();
const t: Translate = (key, values) => translate("zh", key, values);
let manager: ReturnType<typeof useProviderManager>;
let root: Root;
let container: HTMLDivElement;

function Fixture() { manager = useProviderManager(notify, t); return null; }

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([
  "The maximum attempts must be between 1 and 20",
  "The failure threshold must be between 1 and 10",
  "The initial cooldown must be between 1 and 300 seconds",
  "The maximum cooldown must be at least the initial cooldown and at most 3600 seconds",
  "Choose at most 32 retry status codes between 400 and 599",
  "Check the failover settings and try again",
])("localizes policy errors without leaking the backend message: %s", async (message) => {
  vi.mocked(backend.saveAggregateApiProfile).mockRejectedValueOnce(new Error(message));
  await act(async () => {
    expect(await manager.saveAggregateApi({
      name: "Combined", model: "model", memberProviderIds: ["a", "b"], enabled: true,
    })).toBeNull();
  });
  expect(notify).toHaveBeenCalledExactlyOnceWith("请检查故障切换设置后重试。");
  expect(manager.saving).toBe(false);
});
