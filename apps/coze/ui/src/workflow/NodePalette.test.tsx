// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { NodePalette } from "./NodePalette";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); setLanguage("zh");
  document.body.innerHTML = "";
});

async function openPalette(onAdd: (type: string) => void = () => {}) {
  await act(async () => root.render(<NodePalette onAdd={onAdd} />));
  await act(async () => host.querySelector("button")?.click());
  const search = document.querySelector<HTMLInputElement>(".node-palette input");
  if (!search) throw new Error("palette did not open");
  return search;
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const shown = () => [...document.querySelectorAll(".node-palette-list button")].map((button) => button.textContent);
const headings = () => [...document.querySelectorAll(".node-palette-list h4")].map((heading) => heading.textContent);

it("keeps the Chinese palette in the zh-CN test locale", async () => {
  const search = await openPalette();
  expect(host.querySelector("button")?.textContent).toBe("添加节点");
  expect(search.getAttribute("aria-label")).toBe("搜索节点");
  expect(headings()).toEqual(["AI 与知识", "逻辑与交互", "文本与变量", "工具与数据"]);
  await type(search, "JSON");
  expect(shown()).toEqual(["解析 JSON", "生成 JSON"]);
});

it("shows translated labels and searches them together with type ids", async () => {
  setLanguage("ru");
  const added: string[] = [];
  const search = await openPalette((type) => added.push(type));
  expect(host.querySelector("button")?.textContent).toBe("Добавить узел");
  expect(search.getAttribute("placeholder")).toBe("Поиск узлов");
  expect(headings()).toEqual(["ИИ и знания", "Логика и взаимодействие", "Текст и переменные", "Инструменты и данные"]);
  await type(search, "цикл");
  expect(shown()).toEqual(["Цикл по счётчику", "Прервать цикл"]);
  await type(search, "nl2sql");
  expect(shown()).toEqual(["SQL из текстового запроса"]);
  await type(search, "无此节点");
  expect(document.querySelector(".node-palette")?.textContent).toContain("Узлы не найдены");
  await type(search, "llm");
  const [llm] = document.querySelectorAll<HTMLButtonElement>(".node-palette-list button");
  expect(llm.textContent).toBe("Языковая модель");
  await act(async () => llm.click());
  expect(added).toEqual(["llm"]);
});
