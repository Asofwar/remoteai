// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkingStatus } from "./WorkingStatus";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows a single phase label without an additional ticking timer", async () => {
  const render = (active: boolean) => act(async () => root.render(
    <WorkingStatus phase="command" active={active} />));
  await render(true);
  expect(host.textContent).toBe("正在执行命令");
  await act(async () => { vi.advanceTimersByTime(12_000); });
  expect(host.textContent).toBe("正在执行命令");
  expect(vi.getTimerCount()).toBe(0);
  await render(false);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(50_000);
  await render(true);
  expect(host.textContent).toBe("正在执行命令");
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});

it("updates the live status when the next phase arrives", async () => {
  await act(async () => root.render(<WorkingStatus phase="request" active />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("等待响应");
  await act(async () => root.render(<WorkingStatus phase="response" active />));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("正在生成回复");
});
