// @vitest-environment jsdom
import { act, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Provider } from "../../types";
import { ProviderAdvancedSettings } from "./ProviderAdvancedSettings";
import { useProviderRequestOptions } from "./useProviderRequestOptions";

vi.mock("antd", () => ({
  Checkbox: ({ children, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
    <label><input type="checkbox" {...props} />{children}</label>
  ),
  Input: { TextArea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} /> },
}));

let container: HTMLDivElement;
let root: Root;
function Fixture({ provider = null, saving = false }: { provider?: Provider | null; saving?: boolean }) {
  const options = useProviderRequestOptions(provider);
  return <>
    <ProviderAdvancedSettings options={options} saving={saving} t={(key) => key} />
    <output>{options.value ? JSON.stringify(options.value) : "invalid"}</output>
  </>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("validates edited parameters and locks controls while saving", async () => {
  await act(async () => root.render(<Fixture />));
  const body = container.querySelectorAll("textarea")[1];
  await act(async () => {
    body.value = '{"messages":[]}';
    Simulate.change(body);
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("reservedBody");
  expect(container.querySelector("output")?.textContent).toBe("invalid");
  await act(async () => {
    body.value = '{"temperature":0.4}';
    Simulate.change(body);
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(JSON.parse(container.querySelector("output")!.textContent!)).toEqual({
    useFullUrl: true, headers: {}, body: { temperature: 0.4 },
  });
  await act(async () => root.render(<Fixture saving />));
  expect([...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
    .every((control) => control.disabled)).toBe(true);
});

it("loads saved settings and clears them when switching to a new provider", async () => {
  const provider: Provider = {
    id: "saved-provider", kind: "custom", name: "Saved provider", group: "", baseUrl: "https://api.example/v1",
    model: "model", models: ["model"], modelReasoningEfforts: {}, modelContextWindows: {}, modelApiFormats: {},
    imageInputModels: [], imageInputModelsConfigured: false, modelSelectionControlledByCodex: false,
    fastModeEnabled: false, apiFormat: "openaiChat", active: false, autoSwitchEnabled: false, hasApiKey: true,
    supportsDirectSwitch: false, balanceQueryUsesApiKey: true, hasBalanceQueryToken: false,
    hasWalletQueryToken: false, hasWalletLoginCredentials: false,
    requestOptions: {
    useFullUrl: true, headers: { "X-Region": "east" }, body: { thinking: { type: "enabled" } },
  } };
  await act(async () => root.render(<Fixture provider={provider} />));
  expect(JSON.parse(container.querySelector("output")!.textContent!)).toEqual(provider.requestOptions);
  await act(async () => root.render(<Fixture provider={null} />));
  expect(JSON.parse(container.querySelector("output")!.textContent!)).toEqual({
    useFullUrl: false, headers: {}, body: {},
  });
  expect([...container.querySelectorAll("textarea")].every((input) => input.value === "")).toBe(true);
});
