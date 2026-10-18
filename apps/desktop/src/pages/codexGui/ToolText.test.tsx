// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeferredDetails } from "./DeferredDetails";
import { ToolText } from "./ToolText";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const viewport = () => container.querySelector<HTMLDivElement>('[aria-label="工具内容"]')!;

it("renders and copies the full output immediately without loading on scroll", async () => {
  const text = "完整输出\n".repeat(10_000) + "输出结尾";
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await act(async () => root.render(<ToolText text={text} />));
  const output = viewport();
  expect(output.textContent).toBe(text);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="复制完整内容"]')!.click());
  expect(writeText).toHaveBeenCalledWith(text);
  await act(async () => output.dispatchEvent(new Event("scroll")));
  expect(output.textContent).toBe(text);
});

it("shows streamed and replacement output in full while preserving the output element", async () => {
  const text = "first ".repeat(10_000);
  await act(async () => root.render(<ToolText text={text} />));
  const output = viewport();
  output.scrollTop = 100;
  await act(async () => root.render(<ToolText text={text + "streamed end"} />));
  expect(viewport()).toBe(output);
  expect(output.textContent).toBe(text + "streamed end");
  expect(output.scrollTop).toBe(100);
  const replacement = "replacement ".repeat(10_000);
  await act(async () => root.render(<ToolText text={replacement} />));
  expect(output.textContent).toBe(replacement);
});

it("renders complete markdown including the end of long fenced code", async () => {
  const code = "line\n".repeat(1800);
  const text = "```text\n" + code + "```\n\n**Finished**";
  await act(async () => root.render(<ToolText text={text} markdown />));
  const output = viewport();
  expect(output.querySelectorAll("pre")).toHaveLength(1);
  expect(output.querySelector("code")!.textContent).toBe(code);
  expect(output.querySelector("strong")!.textContent).toBe("Finished");
});

it("shows very large tool results in full as plain text", async () => {
  const text = "**工具输出内容** ".repeat(150_000) + "完整结尾";
  await act(async () => root.render(<ToolText text={text} markdown />));
  expect(viewport().querySelector("pre")?.textContent).toBe(text);
});

it("unmounts collapsed output and renders the latest full content when reopened", async () => {
  const text = "command output\n".repeat(10_000);
  const render = (value: string) => act(async () => root.render(
    <DeferredDetails summary={<summary>Command</summary>}>{() => <ToolText text={value} />}</DeferredDetails>));
  await render(text);
  const disclosure = container.querySelector("details")!;
  const toggle = (open: boolean) => act(async () => {
    disclosure.open = open; disclosure.dispatchEvent(new Event("toggle"));
  });
  expect(viewport()).toBeNull();
  await toggle(true);
  expect(viewport().textContent).toBe(text);
  await toggle(false);
  expect(viewport()).toBeNull();
  await render(text + "final line");
  expect(viewport()).toBeNull();
  await toggle(true);
  expect(viewport().textContent).toBe(text + "final line");
});
