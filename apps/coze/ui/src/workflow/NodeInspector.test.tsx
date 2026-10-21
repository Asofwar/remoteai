// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import type { Graph, Node } from "../types";
import { NodeInspector } from "./NodeInspector";

const HAN = /\p{Script=Han}/u;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); setLanguage("zh");
});

function graphWith(node: Node): Graph {
  return { nodes: [{ id: "start", name: "开始", type: "start", x: 0, y: 0 }, node,
    { id: "end", name: "结束", type: "end", x: 0, y: 0 }], edges: [] };
}

async function inspect(node: Node) {
  await act(async () => root.render(<NodeInspector node={node} graph={graphWith(node)} resources={[]} models={[]}
    onChange={() => {}} onClose={() => {}} />));
}

const intent: Node = { id: "intent_1", name: "用户节点名", type: "intent", x: 0, y: 0, model: "", query: "", intents: [] };
const variable: Node = { id: "set_1", name: "用户节点名", type: "variable", x: 0, y: 0, variable_name: "", value: "" };

it("keeps the Chinese copy byte-identical in the zh-CN test locale", async () => {
  await inspect(intent);
  expect(host.querySelector("h3")?.textContent).toBe("意图识别");
  expect(host.querySelector("small")?.textContent).toBe("引用输入：{{input.text}}此节点结果：{{intent_1.output}}");
  expect(host.textContent).toContain("结果中的 intent 为匹配的意图；无法匹配时返回“其他”。");
  expect(host.querySelector("[aria-label='关闭节点配置']")).not.toBeNull();
  await inspect(variable);
  expect(host.textContent).toContain("后续节点可通过 {{variables.变量名称}} 读取。");
});

it("renders the inspector in Russian without Chinese except user data and the runtime fallback", async () => {
  setLanguage("ru");
  await inspect(intent);
  expect(host.querySelector("h3")?.textContent).toBe("Распознавание намерения");
  expect(host.querySelector("small")?.textContent)
    .toBe("Ссылка на входные данные: {{input.text}}Результат этого узла: {{intent_1.output}}");
  expect(host.querySelectorAll("small code")).toHaveLength(2);
  expect(host.textContent).toContain("Если совпадений нет, в нём будет «其他».");
  expect(host.querySelector("[aria-label='Закрыть настройки узла']")).not.toBeNull();
  // ConnectionEditor belongs to the canvas area and lists user node names; check only this inspector's copy.
  const own = host.cloneNode(true) as HTMLElement;
  own.querySelectorAll(".connection-controls").forEach((element) => element.remove());
  expect((own.textContent ?? "").replace("其他", "")).not.toMatch(HAN);
  await inspect(variable);
  expect(host.textContent).toContain("Следующие узлы могут прочитать её через {{variables.имя_переменной}}.");
  expect(host.querySelector("small:last-of-type code")?.textContent).toBe("{{variables.имя_переменной}}");
});

it("switches the code hint with the language and entry point", async () => {
  setLanguage("en");
  const code: Node = { id: "code_1", name: "n", type: "code", x: 0, y: 0, code: "", input: "", language: "javascript",
    entrypoint: false };
  await inspect(code);
  expect(host.textContent).toContain("Read the input from input and return the result with return.");
  await inspect({ ...code, entrypoint: true });
  expect(host.textContent).toContain("In main(args), read the input from args.params and return the result.");
  await inspect({ ...code, language: "python" });
  expect(host.textContent).toContain("In main(args), read the input from args.params and return the result.");
});
