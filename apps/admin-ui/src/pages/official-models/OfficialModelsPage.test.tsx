import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App, ConfigProvider } from "antd";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { foldedRanges } from "@codemirror/language";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n-context";
import { OfficialModelsPage } from "../OfficialModelsPage";
import type { OfficialModelsProps } from "../../hooks/useOfficialModels";
import type { ModelCatalog } from "./catalog";

const initial: ModelCatalog = { metadata: { future: [true, null, 2] }, models: [
  { slug: "model-1", display_name: "First model", description: "Example", context_window: 373000,
    visibility: "list", supported_in_api: true, auto_compact_token_limit: null,
    base_instructions: 'Long instructions\n"quoted" 文本'.repeat(3000),
    supported_reasoning_levels: [{ effort: "low", description: "Fast" }],
    custom: { future: [false, null, { nested: "preserved" }] } },
  { id: "model-2", display_name: "Second model" },
] };
let root: Root;
let container: HTMLDivElement;
let saved: { catalog: ModelCatalog; revision: string } | undefined;

const api: OfficialModelsProps["api"] = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  if (path.endsWith("/official-models/settings")) {
    return { enabled: true, intervalMinutes: 30, revision: "settings-1" } as T;
  }
  if (path.endsWith("/help-assistant")) return { model: "model-1", systemPrompt: "Help", questions: [] } as T;
  if (options?.method === "PATCH") saved = JSON.parse(String(options.body));
  return { catalog: saved?.catalog ?? initial, revision: "catalog-1", updatedAt: "2026-10-16T00:00:00Z" } as T;
};

async function render(canManage = true) {
  await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}>
    <I18nProvider language="zh" onLanguageChange={() => {}}><App>
      <OfficialModelsPage api={api} canManage={canManage} />
    </App></I18nProvider>
  </ConfigProvider>));
}

async function clickText(text: string) {
  const element = [...document.querySelectorAll<HTMLElement>("button, .ant-segmented-item-label")]
    .find((candidate) => candidate.textContent?.replace(/\s/g, "") === text.replace(/\s/g, ""));
  expect(element, text).toBeDefined();
  await act(async () => element!.click());
}

async function fill(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function editor() {
  const content = document.querySelector<HTMLElement>(".cm-content")!;
  expect(content).not.toBeNull();
  return EditorView.findFromDOM(content)!;
}

async function replaceJson(value: string) {
  const view = editor();
  await act(async () => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addListener() {}, removeListener() {} }));
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getStyle(element));
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  saved = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("round-trips both modes, folds long catalogs, and saves all fields with the original revision", async () => {
  await render();
  await fill("1 display_name", "Edited in table");
  await clickText("JSON 编辑");
  const tableDraft = JSON.parse(editor().state.doc.toString()) as ModelCatalog;
  expect(tableDraft.models[0].display_name).toBe("Edited in table");
  await clickText("全部折叠");
  expect(foldedRanges(editor().state).size).toBeGreaterThan(0);
  expect(editor().state.doc.toString()).toBe(JSON.stringify(tableDraft, null, 2));
  await clickText("全部展开");
  expect(foldedRanges(editor().state).size).toBe(0);
  const modified = { ...tableDraft,
    models: [{ ...tableDraft.models[0], context_window: 400000 }, tableDraft.models[1]] };
  await replaceJson(JSON.stringify(modified));
  await clickText("表格编辑");
  expect(document.querySelector<HTMLInputElement>('input[aria-label="1 context_window"]')!.value).toBe("400000");
  await clickText("保存修改");
  expect(saved).toEqual({ catalog: modified, revision: "catalog-1" });
  expect(saved?.catalog.models[0].base_instructions).toBe(initial.models[0].base_instructions);
  expect(saved?.catalog.models[0].custom).toEqual(initial.models[0].custom);
});

it("keeps invalid JSON intact and blocks table switching and saving until repaired", async () => {
  await render();
  await clickText("JSON 编辑");
  await replaceJson('{"models": [');
  expect(document.querySelector<HTMLInputElement>(".ant-segmented-item input")!.disabled).toBe(true);
  const save = [...document.querySelectorAll("button")].find((button) => button.textContent === "保存修改")!;
  expect(save.disabled).toBe(true);
  expect(editor().state.doc.toString()).toBe('{"models": [');
  await replaceJson(JSON.stringify(initial));
  await clickText("表格编辑");
  expect(document.querySelector<HTMLInputElement>('input[aria-label="1 slug"]')!.value).toBe("model-1");
});

it("edits nested fields through the expanded table without discarding other model properties", async () => {
  await render();
  await act(async () => document.querySelector<HTMLButtonElement>(".ant-table-row-expand-icon")!.click());
  await fill("搜索字段", "supported_reasoning_levels");
  await clickText("列表 · 1 项");
  await replaceJson('[{"effort":"high","description":"Deep"}]');
  await clickText("应用");
  await clickText("保存修改");
  expect(saved?.catalog.models[0]).toEqual({ ...initial.models[0],
    supported_reasoning_levels: [{ effort: "high", description: "Deep" }] });
});

it("lets read-only users inspect and fold content while keeping all edits unavailable", async () => {
  await render(false);
  expect(document.querySelector<HTMLInputElement>('input[aria-label="1 slug"]')!.disabled).toBe(true);
  expect([...document.querySelectorAll("button")].some((button) => button.textContent === "保存修改")).toBe(false);
  await act(async () => document.querySelector<HTMLButtonElement>(".ant-table-row-expand-icon")!.click());
  await fill("搜索字段", "custom");
  await clickText("对象 · 1 个字段");
  expect(editor().state.facet(EditorState.readOnly)).toBe(true);
  await clickText("取消");
  await clickText("JSON 编辑");
  expect(editor().state.facet(EditorState.readOnly)).toBe(true);
  await clickText("全部折叠");
  expect(foldedRanges(editor().state).size).toBeGreaterThan(0);
  expect(saved).toBeUndefined();
});
