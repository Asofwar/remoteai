import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_OPTIONS, LANGUAGE_STORAGE_KEY, hasTranslation, isLanguage, translate, type Language } from "./i18n";
import { ru } from "./i18n-ru";
import { useLanguage } from "./hooks/useLanguage";
import { formatDate } from "./utils/format";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const selfServiceSources = [
  "./components/LoginView.tsx",
  "./pages/PasswordResetPage.tsx",
  "./pages/MyAccountsPage.tsx",
  "./components/accounts/OwnAccountEditModal.tsx",
  "./components/modals/ProfileModal.tsx",
  "./components/modals/ProfilePasswordModal.tsx",
  "./hooks/useAuthenticatedApi.ts",
];

function literalKeys(path: string) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  return [...source.matchAll(/["']([a-zA-Z]+(?:\.[a-zA-Z0-9-]+)+)["']/g)]
    .map((match) => match[1])
    .filter(hasTranslation);
}

describe("Russian admin dictionary", () => {
  it("offers Russian as a language", () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(["zh", "en", "ru"]);
    expect(isLanguage("ru")).toBe(true);
    expect(isLanguage("de")).toBe(false);
  });

  it("keeps placeholders and avoids Chinese text", () => {
    for (const [key, value] of Object.entries(ru)) {
      if (!hasTranslation(key) || value === undefined) throw new Error(`Unknown key ${key}`);
      expect(placeholders(value), key).toEqual(placeholders(translate("en", key)));
      expect(value, key).not.toMatch(/\p{Script=Han}/u);
      expect(value, key).not.toContain("...");
    }
  });

  it("covers every key on the public auth pages and the self-service shell", () => {
    const keys = selfServiceSources.flatMap(literalKeys);
    expect(new Set(keys).size).toBeGreaterThan(50);
    expect([...new Set(keys.filter((key) => !(key in ru)))]).toEqual([]);
  });

  it("falls back to English for operator pages and keeps zh and en unchanged", () => {
    expect(translate("ru", "login.submit")).toBe("Войти");
    expect(translate("ru", "nav.dashboard")).toBe("Dashboard");
    expect(translate("ru", "login.locked", { minutes: 3 })).toBe(
      "Слишком много неверных попыток ввода пароля. Повторите попытку через 3 мин.",
    );
    expect(translate("en", "login.submit")).toBe("Sign in");
    expect(translate("zh", "login.submit")).toBe("登录");
  });

  it("formats dates with the Russian locale", () => {
    const value = "2026-01-02T03:04:05Z";
    expect(formatDate(value, "ru")).toBe(new Date(value).toLocaleString("ru-RU"));
  });
});

describe("useLanguage", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  function renderLanguage() {
    let current: Language | null = null;
    function Probe() {
      current = useLanguage()[0];
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Probe />));
    return current;
  }

  it("picks Russian for a Russian browser and sets the document language", () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("ru-RU");
    expect(renderLanguage()).toBe("ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ru");
  });

  it("keeps Chinese as the default for other browsers", () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("de-DE");
    expect(renderLanguage()).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
