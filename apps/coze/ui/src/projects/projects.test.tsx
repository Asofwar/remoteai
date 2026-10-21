// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { AccessPanel } from "./AccessPanel";
import { SharedWorkflow } from "./SharedWorkflow";
import { TemplateLibrary } from "./TemplateLibrary";

type Results = Record<string, unknown>;
let root: Root | undefined;
let host: HTMLElement | undefined;
let requests: { method: string; params?: unknown }[] = [];

/** Answers POST /api by method name and records every request body. */
function serve(results: Results) {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { method: string; params?: unknown };
    requests.push(body);
    return { ok: true, status: 200, json: async () => results[body.method] ?? {} };
  }));
}

async function render(element: ReactNode) {
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
  await act(async () => { await Promise.resolve(); });
}

const buttonByText = (text: string) => [...document.querySelectorAll("button")]
  .find((button) => button.textContent?.trim() === text);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined,
    removeEventListener: () => undefined, dispatchEvent: () => false }));
  // jsdom implements getComputedStyle without pseudo-elements, which the antd modal scroll lock asks for.
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computedStyle(element));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove(); document.body.innerHTML = ""; root = undefined; host = undefined;
  setLanguage("zh"); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it("installs templates in the UI language and translates only built-in entries", async () => {
  setLanguage("ru");
  serve({
    list_templates: [
      { id: "builtin-knowledge-assistant", name: "知识问答助手",
        description: "从资料库回答问题，附上可追溯的引用。选择模型并导入资料后即可使用。", builtin: true },
      { id: "mine", name: "我的模板", description: "自己写的说明", builtin: false },
    ],
    install_template: { entryId: "entry" },
  });
  const onInstalled = vi.fn();
  await render(<TemplateLibrary onInstalled={onInstalled} />);
  await act(async () => document.querySelector<HTMLButtonElement>("button[aria-label='Галерея шаблонов']")?.click());
  await act(async () => { await Promise.resolve(); });
  const titles = [...document.querySelectorAll(".template-card h3")].map((node) => node.textContent);
  expect(titles).toEqual(["Помощник по базе знаний", "我的模板"]);
  expect([...document.querySelectorAll(".template-card small")].map((node) => node.textContent))
    .toEqual(["Встроенный шаблон", "Свой шаблон"]);
  await act(async () => buttonByText("Использовать шаблон")?.click());
  expect(requests.at(-1)).toEqual({ method: "install_template",
    params: { id: "builtin-knowledge-assistant", language: "ru" } });
  expect(onInstalled).toHaveBeenCalledWith("entry");
});

it("localizes the sample input value once and keeps the Chinese sample in zh", async () => {
  serve({ runs: [] });
  await render(<SharedWorkflow resourceId="workflow" />);
  expect(document.querySelector("textarea")?.value).toBe('{"text":"你好"}');
  await act(async () => root?.unmount());
  setLanguage("ru");
  root = createRoot(host!);
  await act(async () => root?.render(<SharedWorkflow resourceId="workflow" />));
  expect(document.querySelector("textarea")?.value).toBe('{"text":"Привет"}');
  expect(document.querySelector("textarea")?.getAttribute("aria-label")).toBe("Входные данные приложения");
  await act(async () => setLanguage("en"));
  expect(document.querySelector("textarea")?.value).toBe('{"text":"Привет"}');
  expect(document.querySelector("h2")?.textContent).toBe("Use the app");
});

it("shows role labels and expiry dates in the UI language without changing role ids", async () => {
  setLanguage("ru");
  serve({
    access_info: { role: "owner" },
    list_access: [
      { id: "a", name: "Ноутбук", role: "viewer", expiresAt: "2026-11-20T12:00:00Z", revokedAt: null },
      { id: "b", name: "Ключ", role: "tool", expiresAt: "2026-11-20T12:00:00Z", revokedAt: null },
    ],
  });
  await render(<AccessPanel appId="app" published />);
  await act(async () => { await Promise.resolve(); });
  expect(document.querySelector("h2")?.textContent).toContain("Доступ к приложению");
  const items = [...document.querySelectorAll(".ant-list-item")];
  expect(items).toHaveLength(1);
  expect(items[0].textContent).toContain("Только просмотр");
  expect(items[0].textContent).toContain("Действует до 20.11.2026");
  expect(buttonByText("Отозвать")).toBeDefined();
  expect(requests.map((request) => request.method)).toEqual(["access_info", "list_access"]);
});
