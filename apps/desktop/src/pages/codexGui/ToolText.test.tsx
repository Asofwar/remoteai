// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToolText } from "./ToolText";
import { OUTPUT_BATCH_CHARACTERS as BATCH } from "./useProgressiveToolText";

let root: Root;
let container: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  frames = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function paint() {
  const pending = [...frames.values()]; frames.clear();
  await act(async () => pending.forEach((callback) => callback(0)));
}
function viewport() {
  const element = container.querySelector<HTMLDivElement>('[aria-label="工具内容"]')!;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, get: () => (element.textContent?.length ?? 0) },
  });
  return element;
}
async function scroll(element: HTMLDivElement, top: number) {
  element.scrollTop = top;
  await act(async () => element.dispatchEvent(new Event("scroll", { bubbles: true })));
  await paint();
}

it("appends on scroll, keeps earlier output and copies the full result before everything is loaded", async () => {
  const text = "a".repeat(BATCH) + "b".repeat(BATCH) + "完整输出结尾";
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await act(async () => root.render(<ToolText text={text} />));
  const output = viewport();
  await paint();
  expect(output.textContent).toBe(text.slice(0, BATCH));
  expect(container.textContent).not.toMatch(/上一段|下一段|分段显示/);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="复制完整内容"]')!.click());
  expect(writeText).toHaveBeenCalledWith(text);
  await scroll(output, BATCH - 350);
  expect(output.textContent).toBe(text.slice(0, BATCH * 2));
  expect(output.scrollTop).toBe(BATCH - 350);
  await scroll(output, BATCH * 2 - 300);
  expect(output.textContent).toBe(text);
  await scroll(output, 0);
  expect(output.textContent).toBe(text);
});

it("keeps the reader's loaded range during streaming and resets for replacement content", async () => {
  const text = "first ".repeat(BATCH);
  await act(async () => root.render(<ToolText text={text} />));
  const output = viewport();
  await scroll(output, 0);
  expect(output.textContent).toHaveLength(BATCH);
  await scroll(output, BATCH - 300);
  await scroll(output, 100);
  await act(async () => root.render(<ToolText text={text + "streamed end"} />));
  await paint();
  expect(output.textContent).toBe(text.slice(0, BATCH * 2));
  expect(output.scrollTop).toBe(100);
  await act(async () => root.render(<ToolText text={"replacement ".repeat(BATCH)} />));
  expect(output.textContent).toHaveLength(BATCH);
  await act(async () => root.render(<ToolText text="short result" />));
  expect(output.textContent).toBe("short result");
});

it("keeps a fenced code block continuous across a loading boundary", async () => {
  const code = "line\n".repeat(1800);
  const text = "```text\n" + code + "```\n\n**Finished**";
  await act(async () => root.render(<ToolText text={text} markdown />));
  const output = viewport();
  await scroll(output, output.scrollHeight - 300);
  expect(output.querySelectorAll("pre")).toHaveLength(1);
  expect(output.querySelector("code")!.textContent).toBe(code);
  expect(output.querySelector("strong")!.textContent).toBe("Finished");
});

it("fills short viewports and cancels pending loading when closed", async () => {
  await act(async () => root.render(<ToolText text={"a".repeat(BATCH * 3)} />));
  const output = viewport();
  Object.defineProperty(output, "scrollHeight", { configurable: true, value: 100 });
  await paint();
  expect(output.textContent).toHaveLength(BATCH * 2);
  expect(frames.size).toBe(1);
  await act(async () => root.render(null));
  expect(frames.size).toBe(0);
});
