// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { translate, type Translate } from "../../../i18n";
import type { AggregateApi, AggregateApiInput, Provider } from "../../../types";
import { AggregateApiManager } from ".";
import { defaultFailoverPolicy } from "./failoverPolicy";
import { buildAggregateMembers, type AggregateMemberOption } from "../../../utils/aggregateMembers";
import { DEMO_ACCOUNTS } from "../../../demo";

const t: Translate = (key, values) => translate("zh", key, values);
const providers: Provider[] = ["first", "second"].map((id) => ({
  id, kind: "custom", name: id, group: "", baseUrl: "https://example.com", model: "model", models: ["model"],
  modelReasoningEfforts: {}, modelContextWindows: {}, imageInputModels: [], modelSelectionControlledByCodex: false,
  modelApiFormats: {}, imageInputModelsConfigured: false, fastModeEnabled: false,
  apiFormat: "openaiResponses", active: false, autoSwitchEnabled: false, hasApiKey: true,
  supportsDirectSwitch: true, balanceQueryUsesApiKey: true, hasBalanceQueryToken: false,
  hasWalletQueryToken: false, hasWalletLoginCredentials: false,
}));
let aggregate: AggregateApi;
let members: AggregateMemberOption[];
let root: Root;
let container: HTMLDivElement;
const onSave = vi.fn<(input: AggregateApiInput) => Promise<AggregateApi | null>>();

async function render() {
  await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}>
    <AggregateApiManager open aggregates={[aggregate]} providers={members} saving={false} busyId={null}
      proxyRunning onClose={() => {}} onSave={onSave} onSwitch={async () => true}
      onDeactivate={() => {}} onDelete={() => {}} t={t} />
  </ConfigProvider>));
}

async function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => element!.click());
}

async function fill(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`#failoverPolicy_${name}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  });
}

beforeEach(() => {
  members = providers;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addListener() {}, removeListener() {} }));
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getStyle(element));
  aggregate = { id: "combined", name: "Combined", model: "model", memberProviderIds: ["first", "second"],
    enabled: true, active: false, memberConversationCounts: {} };
  onSave.mockReset().mockImplementation(async (input) => {
    aggregate = { ...aggregate, ...input };
    return aggregate;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("saves an edited policy, reloads it, and restores defaults without retaining old values", async () => {
  await render();
  await click('button[aria-label="编辑聚合 API"]');
  await click("details summary");
  expect(document.querySelector<HTMLInputElement>("#failoverPolicy_maxAttempts")?.value).toBe("3");
  await fill("maxAttempts", "6");
  await fill("failureThreshold", "4");
  await click("#failoverPolicy_retryOnNetworkErrors");
  await click(".ant-modal-footer .ant-btn-primary");
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ failoverPolicy: {
    ...defaultFailoverPolicy(), maxAttempts: 6, failureThreshold: 4, retryOnNetworkErrors: false,
  } }));
  await render();
  await click('button[aria-label="编辑聚合 API"]');
  expect(document.querySelector<HTMLInputElement>("#failoverPolicy_maxAttempts")?.value).toBe("6");
  await click("details summary");
  const restore = [...document.querySelectorAll<HTMLButtonElement>("details button")]
    .find((button) => button.textContent === "恢复默认设置")!;
  await act(async () => restore.click());
  await click(".ant-modal-footer .ant-btn-primary");
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ failoverPolicy: defaultFailoverPolicy() }));
});

it("blocks an invalid cooldown and preserves settings when failover is turned off", async () => {
  aggregate.failoverPolicy = { ...defaultFailoverPolicy(), maxAttempts: 6 };
  await render();
  await click('button[aria-label="编辑聚合 API"]');
  await click("details summary");
  await fill("initialCooldownSeconds", "80");
  await click(".ant-modal-footer .ant-btn-primary");
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
  expect(document.body.textContent).toContain("请输入不小于首次暂停时长");
  await fill("maxCooldownSeconds", "120");
  await click("#failoverPolicy_enabled");
  expect(document.body.textContent).toContain("每次请求只使用一个 API");
  await click(".ant-modal-footer .ant-btn-primary");
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ failoverPolicy: {
    ...defaultFailoverPolicy(), enabled: false, maxAttempts: 6, initialCooldownSeconds: 80, maxCooldownSeconds: 120,
  } }));
});

it("updates member health from refreshed aggregates without creating a countdown timer", async () => {
  aggregate.memberHealth = {
    first: { state: "coolingDown", consecutiveFailures: 2, retryAfterSeconds: 25 },
    second: { state: "healthy", consecutiveFailures: 0, retryAfterSeconds: 0 },
  };
  await render();
  expect(document.body.textContent).toContain("first · 已暂停 · 剩余 25 秒");
  expect(document.body.textContent).toContain("second · 可用");
  aggregate.memberHealth.first = { state: "recovering", consecutiveFailures: 2, retryAfterSeconds: 0 };
  await render();
  expect(document.body.textContent).toContain("first · 恢复检查中");
});

it("shows official members and keeps their model edits during health refresh", async () => {
  members = buildAggregateMembers({ providers, accounts: DEMO_ACCOUNTS, officialModels: ["official-model"],
    officialLabel: "官方账户", privacyMode: false });
  aggregate.memberProviderIds = ["first", "account:demo-1"];
  aggregate.memberHealth = { "account:demo-1": { state: "healthy", consecutiveFailures: 0, retryAfterSeconds: 0 } };
  await render();
  expect(document.body.textContent).toContain("官方账户 · alex.chen@example.com · 可用");
  await click('button[aria-label="编辑聚合 API"]');
  const input = document.getElementById("memberModels_account:demo-1") as HTMLInputElement;
  expect(input.value).toBe("official-model");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "new-official-model");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  aggregate.memberHealth["account:demo-1"] = { state: "coolingDown", consecutiveFailures: 2, retryAfterSeconds: 25 };
  await render();
  expect(document.body.textContent).toContain("官方账户 · alex.chen@example.com · 已暂停 · 剩余 25 秒");
  await click(".ant-modal-footer .ant-btn-primary");
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    memberProviderIds: ["first", "account:demo-1"],
    memberModels: { first: "model", "account:demo-1": "new-official-model" },
  }));
});
