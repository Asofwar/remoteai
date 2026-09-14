// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guiApi } from "./api";
import type { Content } from "./types";
import { ImageThreadContext } from "./useImageSource";
import { UserMessage } from "./UserMessage";

vi.mock("./api", () => ({ guiApi: { request: vi.fn() } }));
const thumbnail = "data:image/png;base64,dGh1bWJuYWls";
const original = "data:image/png;base64,b3JpZ2luYWw=";
const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
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
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

async function render(image: Content) {
  await act(async () => root.render(<ImageThreadContext.Provider value="task">
    <UserMessage item={{ id: "user", type: "userMessage", content: [image,
      { type: "text", text: "看看这张图片" }] }} />
  </ImageThreadContext.Provider>));
}

it.each(["C:\\images\\copied.jpg", "D:/截图.png"])(
  "shows a sent local image thumbnail and opens its original: %s", async (path) => {
    vi.mocked(guiApi.request).mockResolvedValueOnce({ url: thumbnail }).mockResolvedValue({ url: original });
    await render({ type: "localImage", path });
    expect(guiApi.request).toHaveBeenCalledWith({ operation: "imagePreview", threadId: "task", source: path });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(thumbnail);
    expect(container.textContent).toContain("看看这张图片");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="放大查看：图片附件 1"]')?.click());
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.querySelector("dialog img")?.getAttribute("src")).toBe(original);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭图片"]')?.click());
    expect(container.querySelector("dialog")).toBeNull();
  },
);

it.each([thumbnail, "https://example.com/photo.jpg"])("keeps URL image attachments visible: %s", async (url) => {
  await render({ type: "image", url });
  expect(container.querySelector("img")?.getAttribute("src")).toBe(url);
  expect(guiApi.request).not.toHaveBeenCalled();
});

it("allows retrying a sent local image when the first read fails", async () => {
  vi.mocked(guiApi.request).mockRejectedValueOnce(new Error("missing")).mockResolvedValue({ url: thumbnail });
  await render({ type: "localImage", path: "D:/copied.png" });
  expect(container.textContent).toContain("图片加载失败");
  await act(async () => container.querySelector<HTMLButtonElement>('[role="status"] button')?.click());
  expect(container.querySelector("img")?.getAttribute("src")).toBe(thumbnail);
});
