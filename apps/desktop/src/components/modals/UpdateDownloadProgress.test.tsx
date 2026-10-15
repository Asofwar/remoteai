// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppUpdateProgressTracker } from "../../api/appUpdateProgress";
import { translate, type Translate } from "../../i18n";
import { UpdateDownloadProgress } from "./UpdateDownloadProgress";

const t: Translate = (key, values) => translate("zh", key, values);
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("explains preparation immediately without presenting a made-up percentage", async () => {
  await act(async () => root.render(<UpdateDownloadProgress progress={null} t={t} />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("正在准备下载…");
  expect(container.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
  expect(container.textContent).toContain("已用时 0:00");
  expect(container.textContent).toContain("可关闭此窗口，下载会继续。");
});

it("keeps real progress visible while waiting and explains preparation after the last byte", async () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: { contentLength: 10_240 } }, 0);
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 5_120 } }, 1_000);
  await act(async () => root.render(<UpdateDownloadProgress progress={tracker.snapshot(65_000)} t={t} />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("正在等待下载数据…");
  expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50");
  expect(container.textContent).toContain("5.00 KB / 10.00 KB");
  expect(container.textContent).toContain("0.00 KB/s");
  expect(container.textContent).toContain("已用时 1:05");

  tracker.handleEvent({ event: "Progress", data: { chunkLength: 5_120 } }, 66_000);
  await act(async () => root.render(<UpdateDownloadProgress progress={tracker.snapshot(67_000)} t={t} />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("下载完成，正在准备安装…");
  expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
});

it("shows received bytes with an unknown total instead of a frozen zero percent", async () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: {} }, 0);
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_024 } }, 1_000);
  await act(async () => root.render(<UpdateDownloadProgress progress={tracker.snapshot(1_000)} t={t} />));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("正在下载更新");
  expect(container.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
  expect(container.textContent).toContain("1.00 KB / 大小未知");
  expect(container.textContent).toContain("1.00 KB/s");
});
