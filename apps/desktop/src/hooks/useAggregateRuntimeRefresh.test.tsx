// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as backend from "../api/backend";
import type { AggregateApi, LocalProxyStatus } from "../types";
import { useProviderData } from "./useProviderData";
import { useAggregateRuntimeRefresh } from "./useAggregateRuntimeRefresh";

vi.mock("../api/backend", async (original) => ({
  ...await original<typeof backend>(),
  loadProviders: vi.fn(), loadAggregateApis: vi.fn(), loadLocalProxyStatus: vi.fn(),
  subscribeToProviderEvents: vi.fn(() => () => undefined),
}));
const notify = vi.fn();
const status: LocalProxyStatus = {
  running: true, fastModeEnabled: false, fastModeAvailable: false, address: "127.0.0.1", port: 1234,
  baseUrl: "http://127.0.0.1:1234", autoSwitchOnQuotaExhaustion: false, concurrentAccountRoutingEnabled: false,
  customAutoSwitchPriorityEnabled: false, customAutoSwitchThresholdEnabled: false, globalAutoSwitchThreshold: 0,
  autoDisableUnreachableAccounts: false, systemPromptFilterEnabled: false, systemPromptFilterRules: [],
  systemPromptInjectionEnabled: false, systemPromptInjectionPrompts: [], listenOnAllInterfaces: false, hasLanApiKey: false,
};
const aggregate: AggregateApi = { id: "combined", name: "Combined", model: "model",
  memberProviderIds: ["a", "b"], enabled: true, active: false, memberConversationCounts: {}, memberHealth: {
    a: { state: "healthy", consecutiveFailures: 0, retryAfterSeconds: 0 },
  } };
let root: Root;
let container: HTMLDivElement;

function Fixture({ open }: { open: boolean }) {
  const data = useProviderData(notify);
  // Deliberately change the callback identity on every render, as a page caller may do.
  useAggregateRuntimeRefresh({ active: open, refresh: () => data.load() });
  return <output>{JSON.stringify(data.aggregateApis[0]?.memberHealth)}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const render = (open: boolean) => act(async () => root.render(<Fixture open={open} />));
const advance = (milliseconds: number) => act(async () => vi.advanceTimersByTimeAsync(milliseconds));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(backend.loadProviders).mockResolvedValue([]);
  vi.mocked(backend.loadAggregateApis).mockResolvedValue([aggregate]);
  vi.mocked(backend.loadLocalProxyStatus).mockResolvedValue(status);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("refreshes inactive aggregate health while the manager is open and skips overlapping intervals", async () => {
  await render(false);
  expect(backend.loadAggregateApis).toHaveBeenCalledOnce();
  const pending = deferred<AggregateApi[]>();
  vi.mocked(backend.loadAggregateApis).mockReturnValueOnce(pending.promise);
  await render(true);
  await advance(6_000);
  await render(true);
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(2);
  const cooling: AggregateApi = { ...aggregate, memberHealth: {
    a: { state: "coolingDown", consecutiveFailures: 2, retryAfterSeconds: 30 },
  } };
  await act(async () => pending.resolve([cooling]));
  expect(container.textContent).toContain("coolingDown");
  vi.mocked(backend.loadAggregateApis).mockResolvedValue([aggregate]);
  await advance(2_000);
  expect(container.textContent).toContain("healthy");
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(3);
  await render(false);
  await advance(6_000);
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(3);
});

it("preserves the in-flight guard across closing and reopening, then stops on unmount", async () => {
  await render(false);
  const pending = deferred<AggregateApi[]>();
  vi.mocked(backend.loadAggregateApis).mockReturnValueOnce(pending.promise);
  await render(true);
  await render(false);
  await render(true);
  await advance(4_000);
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve([aggregate]));
  await advance(2_000);
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(3);
  await act(async () => root.render(null));
  await advance(6_000);
  expect(backend.loadAggregateApis).toHaveBeenCalledTimes(3);
});
