// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import type { Locale } from "antd/es/locale";
import enUS from "antd/locale/en_US";
import ruRU from "antd/locale/ru_RU";
import zhCN from "antd/locale/zh_CN";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COZE_DESKTOP_STATE } from "../../../../../shared/coze/desktopBridge";
import { Studio } from "../Studio";
import type { Resource } from "../types";
import { getLanguage, LANGUAGE_STORAGE_KEY, setLanguage, useLanguage, type Language } from "./index";

const antdLocales: Record<Language, Locale> = { zh: zhCN, en: enUS, ru: ruRU };
const prompt: Resource = { id: "prompt", kind: "prompt", name: "周报提示", description: "", draft: { text: "" },
  revision: 1, publishedRevision: null, mcpEnabled: false, updatedAt: "" };

let root: Root | undefined;
let host: HTMLElement | undefined;
let requests: string[] = [];
const parent = { postMessage: vi.fn() };

/** Mirrors main.tsx Root: the antd locale follows the language without remounting the studio. */
function Host({ children }: { children: ReactNode }) {
  return <ConfigProvider locale={antdLocales[useLanguage()]}><AntApp>{children}</AntApp></ConfigProvider>;
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function click(element: Element | null | undefined) {
  if (!element) throw new Error("Missing element");
  return act(async () => { (element as HTMLElement).click(); });
}

function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Sends a desktop state message; only messages from window.parent may switch the language. */
function post(data: unknown, source: unknown = parent) {
  return act(async () => {
    window.dispatchEvent(new MessageEvent("message", { source: source as Window, origin: "http://desktop.local", data }));
  });
}

const buttonText = (text: RegExp) => [...document.querySelectorAll("button")]
  .find((button) => text.test(button.textContent?.replace(/\s+/g, " ").trim() ?? ""));

beforeEach(() => {
  setLanguage("zh");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("parent", parent);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined,
    removeEventListener: () => undefined, dispatchEvent: () => false }));
  // jsdom implements getComputedStyle without pseudo-elements, which antd asks for.
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computedStyle(element));
  requests = [];
  const results: Record<string, unknown> = { access_info: { role: "owner" }, list_resources: [prompt] };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body)) as { method: string };
    requests.push(method);
    return { ok: true, status: 200, json: async () => results[method] ?? [] };
  }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove(); document.body.innerHTML = ""; root = undefined; host = undefined;
  setLanguage("zh"); vi.unstubAllGlobals(); vi.restoreAllMocks(); parent.postMessage.mockReset();
});

it("re-renders an open editor in the desktop language and keeps the unsaved draft", async () => {
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Host><Studio /></Host>));
  await flush();
  await click(document.querySelector('[aria-label="提示词"]'));
  await click(buttonText(/周报提示/));
  const textarea = document.querySelector<HTMLTextAreaElement>(".resource-editor textarea");
  const name = document.querySelector<HTMLInputElement>('.editor-header input[aria-label="名称"]');
  if (!textarea || !name) throw new Error("Editor missing");
  await type(textarea, "每周五总结本周进展");
  await type(name, "周报提示 v2");
  expect(buttonText(/^保 ?存$/)?.disabled).toBe(false);
  const loaded = requests.length;

  await post({ type: COZE_DESKTOP_STATE, busy: false, language: "ru" });
  expect(getLanguage()).toBe("ru");
  expect(document.documentElement.lang).toBe("ru-RU");
  expect(sessionStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ru");
  expect(buttonText(/^Сохранить$/)?.disabled).toBe(false);
  expect(document.querySelector('[aria-label="Промпты"]')).not.toBeNull();
  expect(document.querySelector('[role="tab"]')?.textContent).toBe("Редактирование и предпросмотр");
  expect(textarea.placeholder).toBe("Напишите промпт для многократного использования…");
  // Same elements, same values: the switch neither remounts the editor nor reloads data.
  expect(document.querySelector(".resource-editor textarea")).toBe(textarea);
  expect(textarea.value).toBe("每周五总结本周进展");
  expect(name.value).toBe("周报提示 v2");
  expect(name.getAttribute("aria-label")).toBe("Название");
  expect(requests.length).toBe(loaded);

  await post({ type: COZE_DESKTOP_STATE, busy: false, language: "en" });
  expect(buttonText(/^Save$/)?.disabled).toBe(false);
  expect(document.documentElement.lang).toBe("en-US");
  expect(textarea.value).toBe("每周五总结本周进展");

  // Ignored: another source, an older desktop without a language, and an unknown language.
  await post({ type: COZE_DESKTOP_STATE, busy: false, language: "ru" }, window);
  await post({ type: COZE_DESKTOP_STATE, busy: false });
  await post({ type: COZE_DESKTOP_STATE, busy: false, language: "fr" });
  await post({ type: "other", language: "ru" });
  expect(getLanguage()).toBe("en");
  expect(buttonText(/^Save$/)).toBeDefined();
  expect(textarea.value).toBe("每周五总结本周进展");
  expect(requests.length).toBe(loaded);
});
