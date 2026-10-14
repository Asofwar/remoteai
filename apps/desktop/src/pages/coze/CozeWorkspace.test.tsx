// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COZE_DESKTOP_READY, COZE_DESKTOP_STATE, COZE_DESKTOP_STOP } from "../../../../../shared/coze/desktopBridge";
import { CozeWorkspace } from "./CozeWorkspace";

const url = "http://127.0.0.1:4321/";
const origin = new URL(url).origin;
const stop = vi.fn(async () => {});
let host: HTMLDivElement;
let root: Root;
let frame: HTMLIFrameElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CozeWorkspace url={url} busy={false} error="" onStop={stop} />));
  frame = host.querySelector("iframe")!;
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals();
});

it("only stops for messages from the current Coze frame and origin", async () => {
  for (const message of [
    { source: window, origin, data: COZE_DESKTOP_STOP },
    { source: frame.contentWindow, origin: "https://unrelated.example", data: COZE_DESKTOP_STOP },
    { source: frame.contentWindow, origin, data: { type: COZE_DESKTOP_STOP } },
  ]) await act(async () => { window.dispatchEvent(new MessageEvent<unknown>("message", message)); });
  expect(stop).not.toHaveBeenCalled();
  await act(async () => { window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin, data: COZE_DESKTOP_STOP,
  })); });
  expect(stop).toHaveBeenCalledOnce();
});

it("announces availability, blocks requests while busy, and allows retry after a failure", async () => {
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  await act(async () => { window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin, data: COZE_DESKTOP_READY,
  })); });
  expect(post).toHaveBeenLastCalledWith({ type: COZE_DESKTOP_STATE, busy: false }, origin);
  await act(async () => root.render(<CozeWorkspace url={url} busy error="" onStop={stop} />));
  expect(post).toHaveBeenLastCalledWith({ type: COZE_DESKTOP_STATE, busy: true }, origin);
  await act(async () => { window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin, data: COZE_DESKTOP_STOP,
  })); });
  expect(stop).not.toHaveBeenCalled();
  await act(async () => root.render(<CozeWorkspace url={url} busy={false} error="请重试" onStop={stop} />));
  expect(post).toHaveBeenLastCalledWith({ type: COZE_DESKTOP_STATE, busy: false }, origin);
  expect(host.textContent).toContain("请重试");
  await act(async () => { window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin, data: COZE_DESKTOP_STOP,
  })); });
  expect(stop).toHaveBeenCalledOnce();
});
