import { afterEach, expect, it } from "vitest";
import { setLanguage, translate, type Translate } from "../i18n";
import { newNode, nodeLabels } from "./nodes";

const HAN = /\p{Script=Han}/u;
const translator = (language: "en" | "ru"): Translate => (source, values) => translate(language, source, values);

afterEach(() => setLanguage("zh"));

it("keeps the Chinese defaults in the zh-CN test locale", () => {
  const input = newNode("input", 0);
  expect(input).toMatchObject({ name: "等待用户输入", prompt: "请补充以下信息。", type: "input", x: 40, y: 220 });
  expect(input.fields).toEqual([{ name: "answer", description: "回答", kind: "string", required: true }]);
  expect(newNode("intent", 5)).toMatchObject({ name: "意图识别", intents: ["咨询", "反馈"], x: 290, y: 360 });
  expect(newNode("conversation", 0).input).toEqual({ title: "新的会话" });
  expect(newNode("knowledge_write", 0).document_name).toBe("新的文档");
});

it("localizes the name and default content once, with the translator it is given", () => {
  const intent = newNode("intent", 0, translator("ru"));
  expect(intent).toMatchObject({ name: "Распознавание намерения", intents: ["Вопрос", "Отзыв"], query: "{{input.text}}" });
  const input = newNode("input", 0, translator("en"));
  expect(input).toMatchObject({ name: "Wait for user input", prompt: "Provide the following information." });
  expect(input.fields).toEqual([{ name: "answer", description: "Answer", kind: "string", required: true }]);
  expect(newNode("conversation", 0, translator("ru")).input).toEqual({ title: "Новый чат" });
  expect(newNode("knowledge_write", 0, translator("en")).document_name).toBe("New document");
  // Code, SQL and template syntax stay as they are.
  expect(newNode("sql", 0, translator("ru")).sql).toBe("SELECT * FROM t1 LIMIT 100");
  expect(newNode("code", 0, translator("ru")).code).toBe("return { result: input.text };");
});

it("uses the current UI language by default", () => {
  setLanguage("en");
  expect(newNode("llm", 0).name).toBe("LLM");
  setLanguage("ru");
  expect(newNode("break", 0).name).toBe("Прервать цикл");
});

it("names every node type and its default content in English and Russian", () => {
  for (const language of ["en", "ru"] as const) {
    for (const type of Object.keys(nodeLabels)) {
      const node = newNode(type, 0, translator(language));
      expect(JSON.stringify(node), `${language}: ${type}`).not.toMatch(HAN);
    }
  }
});

it("falls back to the type id for an unknown type", () => {
  expect(newNode("custom", 0, translator("ru")).name).toBe("custom");
});
