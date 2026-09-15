// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UsageStatus } from "./UsageStatus";
import { invoke } from "../../api/backend";
import { parseContextCapacity } from "./useContextSettings";

vi.mock("../../api/backend", () => ({ invoke: vi.fn(), isHostedWebApp: false, canManageCodexConnection: true }));
let root: Root;
let container: HTMLDivElement;
const click = (element: HTMLElement) => act(async () => element.click());
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const footerButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".ant-modal-footer button")]
  .find((element) => element.textContent?.replace(/ /g, "") === label)!;
const input = () => document.querySelector<HTMLInputElement>('input[aria-label="上下文容量（K Token）"]')!;
const render = (threadId = "one") => act(async () => root.render(<UsageStatus active threadId={threadId} />));
async function openSettings() {
  await click(button("查看上下文用量"));
  expect(document.querySelector(".ant-popover")?.textContent).toContain("背景信息窗口");
  expect(document.querySelector(".ant-popover")?.textContent).not.toContain("背景信息窗口：");
  await click(button("设置当前对话的上下文容量"));
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const computed = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computed(element));
  vi.mocked(invoke).mockReset().mockImplementation((command) => command === "codex_gui_context_settings"
    ? Promise.resolve({ capacity: 128_000 }) : new Promise(() => {}));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it("opens while polling is pending, saves only this conversation and restores defaults", async () => {
  await render(); await openSettings();
  expect(input().value).toBe("128");
  expect(document.querySelector(".ant-modal")?.textContent).toContain("下次发送消息时生效");
  await type("256");
  vi.mocked(invoke).mockResolvedValueOnce({ capacity: 256_000 });
  await click(footerButton("保存"));
  expect(invoke).toHaveBeenLastCalledWith("codex_gui_set_context_settings",
    { threadId: "one", settings: { capacity: 256_000 } });
  expect(document.querySelector(".ant-modal")).toBeNull();
  await openSettings();
  await click([...document.querySelectorAll<HTMLButtonElement>(".ant-modal button")]
    .find((element) => element.textContent === "恢复默认")!);
  vi.mocked(invoke).mockResolvedValueOnce({ capacity: null });
  await click(footerButton("保存"));
  expect(invoke).toHaveBeenLastCalledWith("codex_gui_set_context_settings",
    { threadId: "one", settings: { capacity: null } });
});

it("validates input and retains edits after a failed save without exposing internal errors", async () => {
  await render(); await openSettings(); await type("-1"); await click(footerButton("保存"));
  expect(invoke).not.toHaveBeenCalledWith("codex_gui_set_context_settings", expect.anything());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("请输入");
  await type("512"); vi.mocked(invoke).mockRejectedValueOnce(new Error("secret-path"));
  await click(footerButton("保存"));
  expect(input().value).toBe("512");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("未能保存");
  expect(document.body.textContent).not.toContain("secret-path");
  vi.mocked(invoke).mockResolvedValueOnce({ capacity: 512_000 }); await click(footerButton("保存"));
  expect(document.querySelector(".ant-modal")).toBeNull();
});

it("discards stale loads when switching conversations and prevents saving before a successful read", async () => {
  await render();
  let resolve!: (value: { capacity: number }) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await openSettings(); expect(footerButton("保存").disabled).toBe(true);
  await render("two"); await openSettings(); expect(input().value).toBe("128");
  await act(async () => resolve({ capacity: 999_000 })); expect(input().value).toBe("128");
  await type("256"); vi.mocked(invoke).mockResolvedValueOnce({ capacity: 256_000 });
  await click(footerButton("保存"));
  expect(invoke).toHaveBeenLastCalledWith("codex_gui_set_context_settings",
    { threadId: "two", settings: { capacity: 256_000 } });
});

it("offers retry after a failed read", async () => {
  await render(); vi.mocked(invoke).mockRejectedValueOnce(new Error("private")); await openSettings();
  expect(footerButton("保存").disabled).toBe(true);
  await click([...document.querySelectorAll<HTMLButtonElement>(".ant-modal button")]
    .find((element) => element.textContent === "重试")!);
  expect(input().value).toBe("128"); expect(footerButton("保存").disabled).toBe(false);
});

it.each([["", null], [" ", null], ["128", 128_000], ["1.001", 1_001], ["0", undefined],
  ["-1", undefined], ["NaN", undefined], ["Infinity", undefined], ["100001", undefined],
  ["1.0001", undefined]])("parses capacity %j", (value, expected) => {
  expect(parseContextCapacity(value as string)).toBe(expected);
});

it("selects every preset without saving until confirmed while polling is pending", async () => {
  await render(); await openSettings();
  for (const capacity of [128, 272, 384, 400, 1000]) {
    await act(async () => input().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    const option = [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")]
      .find((element) => element.textContent === `${capacity}K`)!;
    expect(option).toBeTruthy();
    await click(option);
    expect(input().value).toBe(String(capacity));
    expect(invoke).not.toHaveBeenCalledWith("codex_gui_set_context_settings", expect.anything());
  }
  vi.mocked(invoke).mockResolvedValueOnce({ capacity: 1_000_000 });
  await click(footerButton("保存"));
  expect(invoke).toHaveBeenLastCalledWith("codex_gui_set_context_settings",
    { threadId: "one", settings: { capacity: 1_000_000 } });
});

it("uses Enter to select a preset without prematurely saving the previous value", async () => {
  await render(); await openSettings(); await type("256");
  await act(async () => input().dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowDown", keyCode: 40, bubbles: true })));
  await act(async () => input().dispatchEvent(new KeyboardEvent("keydown",
    { key: "Enter", keyCode: 13, bubbles: true })));
  expect(input().value).toBe("128");
  expect(invoke).not.toHaveBeenCalledWith("codex_gui_set_context_settings", expect.anything());
  vi.mocked(invoke).mockResolvedValueOnce({ capacity: 128_000 });
  await click(footerButton("保存"));
  expect(invoke).toHaveBeenLastCalledWith("codex_gui_set_context_settings",
    { threadId: "one", settings: { capacity: 128_000 } });
});
