// @vitest-environment jsdom
import { expect, it } from "vitest";
import { translate } from "./i18n";
import { sampleRow } from "./TableEditor";
import { defaultTableColumns } from "./types";

it("builds the sample row from the default columns of a new table", () => {
  expect(sampleRow((source) => source)).toBe('{"名称": "", "内容": ""}');
  for (const language of ["en", "ru"] as const) {
    const t = (source: string) => translate(language, source);
    expect(Object.keys(JSON.parse(sampleRow(t)) as object)).toEqual(defaultTableColumns(t));
  }
  expect(sampleRow((source) => translate("ru", source))).toBe('{"Название": "", "Содержимое": ""}');
});
