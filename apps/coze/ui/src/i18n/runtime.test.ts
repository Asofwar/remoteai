import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dictionaries, translate, type Dictionary } from "./index";

/**
 * Rust runtime messages reach the editor as Chinese text (the /api error body, job.error,
 * the persisted runs.error, the template list) and are translated with the runtime area
 * dictionaries. These tests read the Rust sources, so a new or changed message fails here
 * until en/runtime.ts and ru/runtime.ts translate it.
 */
const RUST = new URL("../../../src/", import.meta.url);
const HAN = /\p{Script=Han}/u;
const IMPORT_ERROR = "暂时无法导入此节点：{reason}。";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, RUST)), "utf8");
/** Production code only: the unit test module sits at the end of each file. */
const withoutTests = (text: string) => text.split(/^#\[cfg\(test\)\]/m)[0];
/** Rust string literals with escapes resolved (only the simple escapes these files use). */
const literals = (text: string) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
  .map((match) => match[1].replace(/\\\r?\n\s*/g, "").replace(/\\(["\\])/g, "$1"));
const hasOwn = (dictionary: Dictionary, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);
const untranslated = (keys: readonly string[]) => keys.flatMap((key) => (["en", "ru"] as const)
  .filter((language) => !hasOwn(dictionaries[language], key)).map((language) => `${language}: ${key}`));

/** `#[error("…")]` Display texts; `{0}` is the only argument and becomes `{reason}`. */
function errorMessages(): string[] {
  return [...read("error.rs").matchAll(/#\[error\(\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1].replace("{0}", "{reason}"));
}

/** Every Chinese literal passed to `unsupported(…)`, the reason inside `暂时无法导入此节点：{reason}。`. */
function importReasons(): string[] {
  return ["workflow/upstream.rs", "workflow/upstream/values.rs"].flatMap((path) => {
    const text = withoutTests(read(path));
    return [...text.matchAll(/(?<!fn\s+)\bunsupported\(/g)].flatMap((match) => {
      let depth = 1;
      let end = match.index + match[0].length;
      while (depth > 0 && end < text.length) {
        if (text[end] === "(") depth += 1;
        else if (text[end] === ")") depth -= 1;
        end += 1;
      }
      return literals(text.slice(match.index + match[0].length, end - 1)).filter((value) => HAN.test(value));
    });
  });
}

/** Messages the runtime stores in runs.error for runs that were interrupted by a restart. */
function persistedRunErrors(): string[] {
  return ["main.rs", "workflow/checkpoint.rs"].flatMap((path) => literals(withoutTests(read(path)))
    .filter((value) => HAN.test(value))
    // SQL text: take the quoted value (`error='…'`); a bound parameter is the literal itself.
    .flatMap((value) => {
      const quoted = [...value.matchAll(/'([^']*)'/g)].map((match) => match[1]).filter((part) => HAN.test(part));
      return quoted.length > 0 ? quoted : [value];
    }));
}

/** Name and description of the entries in the built-in template list. */
function builtinTemplateEntries(): string[] {
  const text = read("catalog.rs");
  const body = text.slice(text.indexOf("fn builtin_entries"));
  const block = body.slice(0, body.search(/^}/m));
  return [...block.matchAll(/"(?:name|description)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
}

describe("Rust runtime messages", () => {
  const messages = errorMessages();
  const reasons = importReasons();
  const persisted = persistedRunErrors();
  const templates = builtinTemplateEntries();

  it("finds the messages in the Rust sources", () => {
    expect(messages.length).toBeGreaterThanOrEqual(19);
    expect(messages).toContain(IMPORT_ERROR);
    expect(messages.filter((message) => /\{\w+\}/.test(message))).toEqual([IMPORT_ERROR]);
    expect(reasons).toEqual(expect.arrayContaining(["嵌套画布", "未知类型", "变量表达式", "应用或系统变量"]));
    expect(reasons.length).toBeGreaterThanOrEqual(8);
    expect(persisted).toEqual(expect.arrayContaining(["上次运行已中断。", "运行已中断，请检查已完成的步骤后重新运行。"]));
    expect(templates).toEqual(expect.arrayContaining(["知识问答助手"]));
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });

  it("translates every error.rs message into English and Russian", () => {
    expect(untranslated(messages)).toEqual([]);
  });

  it("translates every node import reason, also inside the import error", () => {
    expect(untranslated(reasons)).toEqual([]);
    for (const reason of reasons) {
      const source = IMPORT_ERROR.replace("{reason}", reason);
      expect(translate("zh", source)).toBe(source);
      expect(translate("en", source)).toBe(`This node can't be imported yet: ${dictionaries.en[reason]}.`);
      expect(translate("ru", source)).toBe(`Сейчас не удаётся импортировать этот узел: ${dictionaries.ru[reason]}.`);
    }
    expect(translate("ru", "暂时无法导入此节点：嵌套画布。")).toBe("Сейчас не удаётся импортировать этот узел: вложенный холст.");
  });

  it("translates the persisted run errors and the built-in template entry", () => {
    expect(untranslated([...persisted, ...templates])).toEqual([]);
    expect(translate("en", "上次运行已中断。")).toBe("The previous run was interrupted.");
    expect(translate("ru", "知识问答助手")).toBe("Помощник по базе знаний");
  });

  it("returns every runtime message unchanged in Chinese", () => {
    for (const source of [...messages.filter((message) => message !== IMPORT_ERROR), ...persisted, ...templates]) {
      expect(translate("zh", source)).toBe(source);
      expect(translate("en", source)).not.toMatch(HAN);
      expect(translate("ru", source)).not.toMatch(HAN);
    }
  });
});
