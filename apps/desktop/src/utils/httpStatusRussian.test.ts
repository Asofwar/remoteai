import { describe, expect, it } from "vitest";
import { httpStatusOptions } from "./httpStatusOptions";
import { HTTP_STATUS_RU } from "./httpStatusRussian";

const HAN = /\p{Script=Han}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

describe("HTTP_STATUS_RU", () => {
  const codes = httpStatusOptions("en").map((status) => status.value);

  it("covers exactly the codes offered by the status picker", () => {
    expect(Object.keys(HTTP_STATUS_RU).map(Number).sort((a, b) => a - b)).toEqual(
      [...codes].sort((a, b) => a - b),
    );
  });

  it("gives every code a Russian sentence without Han characters", () => {
    for (const code of codes) {
      const description = HTTP_STATUS_RU[code];
      expect(description, `code ${code}`).toMatch(CYRILLIC);
      expect(description, `code ${code}`).not.toMatch(HAN);
      expect(description, `code ${code}`).toMatch(/\.$/);
      expect(description, `code ${code}`).not.toMatch(/\.\.\.|"/);
    }
  });
});

describe("httpStatusOptions", () => {
  it("uses Russian descriptions for ru and keeps labels and values", () => {
    const ru = httpStatusOptions("ru");
    const en = httpStatusOptions("en");
    expect(ru.map(({ value, label }) => ({ value, label }))).toEqual(
      en.map(({ value, label }) => ({ value, label })),
    );
    const notFound = ru.find((status) => status.value === 404);
    expect(notFound?.description).toBe("Запрошенный ресурс не найден.");
    expect(notFound?.searchText).toBe("404 not found запрошенный ресурс не найден.");
    for (const status of ru) expect(status.description).toBe(HTTP_STATUS_RU[status.value]);
  });

  it("keeps English and Chinese descriptions unchanged", () => {
    expect(httpStatusOptions("en").find((status) => status.value === 404)?.description)
      .toBe("The requested resource was not found.");
    expect(httpStatusOptions("zh").find((status) => status.value === 404)?.description)
      .toBe("未找到请求的资源。");
  });
});
