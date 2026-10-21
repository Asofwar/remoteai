import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { dictionaries, dictionaryAreas, kindCopy, type Dictionary } from "./index";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const HAN = /\p{Script=Han}/u;

interface Usage { file: string; line: number; text: string }
interface Scan { file: string; keys: Usage[]; loose: Usage[] }

const posix = (path: string) => path.split(sep).join("/");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
const hasOwn = (dictionary: Dictionary, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);
const describeUsage = ({ file, line, text }: Usage) => `${file}:${line} ${JSON.stringify(text)}`;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const name = posix(relative(SRC, path));
    if (entry.isDirectory()) return name === "i18n/en" || name === "i18n/ru" ? [] : sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || name === "i18n/kinds.ts") return [];
    return [path];
  });
}

/** Collects t()/msg()/translate() keys and every other string or JSX text that contains Han characters. */
function scan(file: string, text: string): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const result: Scan = { file, keys: [], loose: [] };
  const usage = (node: ts.Node, text: string): Usage =>
    ({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text });
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "verbatim") return;
      const keyIndex = name === "t" || name === "msg" ? 0 : name === "translate" ? 1 : -1;
      if (keyIndex >= 0) {
        node.arguments.forEach((argument, index) => {
          if (index === keyIndex && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
            result.keys.push(usage(argument, argument.text));
          } else visit(argument);
        });
        return;
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && HAN.test(node.text)) {
      result.loose.push(usage(node, node.text.trim()));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

const scans = sourceFiles(SRC).map((path) => scan(posix(relative(SRC, path)), readFileSync(path, "utf8")));
const areas = (["en", "ru"] as const).flatMap((language) => Object.entries(dictionaryAreas[language])
  .map(([path, dictionary]) => ({ language, area: basename(path), dictionary })));

describe("Coze UI dictionaries", () => {
  it("finds keys and loose Chinese literals", () => {
    const sample = scan("sample.tsx", [
      'import { msg, t, verbatim } from "../i18n";',
      'type Role = "查看";',
      'const a = t("你好，{name}", { name: "名字" }); const b = msg("早");',
      'const c = <p title="标题">世界</p>; const d = verbatim("其他");',
      'const e = t(`编号 ${a}`); const f = translate("ru", "晚");',
    ].join("\n"));
    expect(sample.keys.map((item) => item.text)).toEqual(["你好，{name}", "早", "晚"]);
    expect(sample.loose.map((item) => item.text)).toEqual(["名字", "标题", "世界", "编号"]);
    expect(scans.find((item) => item.file === "Studio.tsx")?.keys.length).toBeGreaterThan(20);
  });

  it("translates every t() and msg() literal into English and Russian", () => {
    const missing = scans.flatMap((item) => item.keys).flatMap((key) => (["en", "ru"] as const)
      .filter((language) => !hasOwn(dictionaries[language], key.text))
      .map((language) => `${language}: ${describeUsage(key)}`));
    expect(missing).toEqual([]);
  });

  it("keeps the placeholders of the key and contains no Chinese", () => {
    const problems = areas.flatMap(({ language, area, dictionary }) => Object.entries(dictionary).flatMap(([key, value]) => {
      if (typeof value !== "string") return [`${language}/${area}: ${key} is not a string`];
      return [
        ...(placeholders(key) === placeholders(value) ? [] : [`${language}/${area}: placeholders differ in ${key}`]),
        ...(HAN.test(value) ? [`${language}/${area}: Chinese in the value of ${key}`] : []),
      ];
    }));
    expect(problems).toEqual([]);
  });

  it("defines the same areas and keys in English and Russian", () => {
    const keysOf = (language: "en" | "ru") => Object.fromEntries(areas.filter((item) => item.language === language)
      .map(({ area, dictionary }) => [area, Object.keys(dictionary).sort()]));
    expect(keysOf("ru")).toEqual(keysOf("en"));
  });

  it("gives a key the same value in every area", () => {
    const seen = new Map<string, { area: string; value: string }>();
    const conflicts = areas.flatMap(({ language, area, dictionary }) => Object.entries(dictionary).flatMap(([key, value]) => {
      const previous = seen.get(`${language}\u0000${key}`);
      if (!previous) { seen.set(`${language}\u0000${key}`, { area, value }); return []; }
      return previous.value === value ? [] : [`${language}: ${key} is "${previous.value}" in ${previous.area} and "${value}" in ${area}`];
    }));
    expect(conflicts).toEqual([]);
  });

  it("keeps every Chinese literal inside t(), msg() or verbatim()", () => {
    const loose = scans.flatMap((item) => item.loose);
    expect(loose.map(describeUsage)).toEqual([]);
  });
});

describe("resource kind copy", () => {
  it("keeps the Chinese labels and phrases used before localization", () => {
    for (const copy of Object.values(kindCopy.zh)) {
      expect(copy).toEqual({ section: copy.item, item: copy.item, create: `新建${copy.item}`,
        empty: `还没有${copy.item}`, first: `创建第一个${copy.item}` });
    }
  });

  it("has complete English and Russian copy without Chinese", () => {
    for (const language of ["en", "ru"] as const) {
      expect(Object.keys(kindCopy[language]).sort()).toEqual(Object.keys(kindCopy.zh).sort());
      for (const copy of Object.values(kindCopy[language])) {
        for (const text of Object.values(copy)) expect(text).toMatch(/^[^\p{Script=Han}]+$/u);
      }
    }
  });
});
