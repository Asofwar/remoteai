/**
 * Coze UI localization: the contract every Coze UI module follows.
 *
 * Keys and storage
 * - Chinese source strings are the keys. Chinese output is the source itself, so the
 *   zh UI, the zh-CN unit tests and the Chinese e2e selectors stay byte-identical.
 * - Translations live in per-area files `./en/<area>.ts` and `./ru/<area>.ts`. Each file
 *   has one default export, `export default { "中文": "English" } satisfies Record<string, string>;`.
 *   They are collected with `import.meta.glob`, so adding an area needs no aggregator
 *   edit. The same key in two areas must have the same value (coverage.test.ts checks).
 * - Coze does not use the shared Remote AI dictionaries (shared/i18n/en, ru): they are
 *   large and some short keys mean something else there (`应用` is "Apply").
 *
 * API (import from "./i18n" or "../i18n")
 * - `const t = useT();` in components: re-renders on a language switch; the function is
 *   stable for a language, so it is safe in hook dependency lists.
 * - `t(source, values?)` outside React (event handlers, hooks' callbacks, plain modules).
 *   It reads the current language at call time. Never call it at module top level.
 * - `translate(language, source, values?)` for an explicit language.
 * - Lookup is an own-property match on the exact source; a missing key returns the
 *   source. `{name}` placeholders are replaced in one pass and only for supplied values.
 * - Parameterised runtime messages are listed in `PATTERNS` below. The only one today is
 *   the Rust error `暂时无法导入此节点：{reason}。`; its reason is translated as its own key.
 * - `msg("中文")` returns its argument unchanged and marks a Chinese string that is stored
 *   now and translated later with `t(value)`: error state, constants such as node labels,
 *   thrown `Error` messages. `verbatim("中文")` marks a Chinese literal that must never be
 *   translated (protocol values, classifier patterns). Every Chinese literal in `src` sits
 *   inside `t()`, `msg()` or `verbatim()`; coverage.test.ts enforces it and requires en and
 *   ru entries for every `t()` and `msg()` literal. Always name the translator `t`.
 * - `useLanguage()` / `getLanguage()` / `setLanguage(language)`.
 * - `useKindCopy()` returns `kindCopy[language]` from ./kinds: `{ section, item, create,
 *   empty, first }` per resource kind; it replaces the old Chinese kind labels.
 * - `formatDate`, `formatDateTime`, `formatNumber`, `formatList` format for the current
 *   language (Intl with `localeForLanguage`). A component that formats must call
 *   `useT()` or `useLanguage()` so it re-renders on a switch. `formatList` joins Chinese
 *   items with `、` exactly as before.
 *
 * Rules
 * - Keep Chinese sources in state and constants; translate at render time. Never
 *   translate inside `api()` / `errorText()` or values that code compares (status ids,
 *   protocol values, error classifiers). Rust error texts reach the UI as Chinese; render
 *   them with `t(error)` (their translations are the runtime area). `api()` throws
 *   `ApiError` (api.ts) with the HTTP `status`: test `status === 404` instead of the text.
 * - Default data (node names, prompts, sample values) is localized once when it is
 *   created, by passing `t` (`defaultDraft(kind, t)`, `createDefaultGraph(t)`,
 *   `defaultTableColumns(t)` in types.ts), and never re-translated.
 * - One message per sentence: use placeholders instead of concatenation, and avoid a
 *   number directly before a Russian noun ("Записей: {count}").
 *
 * Language source
 * 1. The desktop appends `lang=<zh|en|ru>` to the iframe fragment; api.ts passes it to
 *    `setLanguage`, which keeps it in sessionStorage `coze-language`.
 * 2. Live switches arrive as the desktop state message
 *    `{ type: "remoteai:coze:state", language }` from `window.parent`.
 * 3. Without either, `deviceLanguage()` from shared/i18n/language.ts decides.
 *
 * This module uses `import.meta.glob`, so it only loads through Vite and Vitest.
 * Modules that Playwright specs import directly (types.ts) must not import it.
 */
/// <reference types="vite/client" />
import { useMemo, useSyncExternalStore } from "react";
import { COZE_DESKTOP_STATE } from "../../../../../shared/coze/desktopBridge";
import {
  deviceLanguage, isLanguage, localeForLanguage, type Language,
} from "../../../../../shared/i18n/language";
import type { Kind } from "../types";
import { kindCopy, type KindCopy } from "./kinds";

export { isLanguage, kindCopy, localeForLanguage };
export type { KindCopy, Language };

export type TranslationValues = Record<string, string | number>;
export type Translate = (source: string, values?: TranslationValues) => string;
export type Dictionary = Readonly<Record<string, string>>;
type TranslatedLanguage = Exclude<Language, "zh">;

export const LANGUAGE_STORAGE_KEY = "coze-language";

/** Marks a Chinese source string that is stored now and translated later with `t()`. */
export function msg<T extends string>(source: T): T {
  return source;
}

/** Marks a Chinese literal that must stay untranslated (protocol values, classifiers). */
export function verbatim<T extends string>(value: T): T {
  return value;
}

const englishAreas = import.meta.glob<Dictionary>("./en/*.ts", { eager: true, import: "default" });
const russianAreas = import.meta.glob<Dictionary>("./ru/*.ts", { eager: true, import: "default" });

/** Area dictionaries by file path, exposed for the coverage tests. */
export const dictionaryAreas: Readonly<Record<TranslatedLanguage, Readonly<Record<string, Dictionary>>>> = {
  en: englishAreas, ru: russianAreas,
};

function merge(areas: Readonly<Record<string, Dictionary>>): Dictionary {
  const merged: Record<string, string> = {};
  for (const path of Object.keys(areas).sort()) Object.assign(merged, areas[path]);
  return merged;
}

export const dictionaries: Readonly<Record<TranslatedLanguage, Dictionary>> = {
  en: merge(englishAreas), ru: merge(russianAreas),
};

const hasOwn = (dictionary: Dictionary, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);

/** Substitute once so values containing placeholders stay verbatim (same as shared translate.ts). */
export function interpolate(template: string, values: TranslationValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}

/** Runtime messages with an embedded value; each captured value is looked up as its own key. */
const PATTERNS = [msg("暂时无法导入此节点：{reason}。")].map((key) => {
  const names: string[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{(\w+)\\\}/g, (_, name: string) => { names.push(name); return "(.+?)"; });
  return { key, names, pattern: new RegExp(`^${escaped}$`, "s") };
});

function translatePattern(dictionary: Dictionary, source: string): string | undefined {
  for (const { key, names, pattern } of PATTERNS) {
    const match = pattern.exec(source);
    if (!match || !hasOwn(dictionary, key)) continue;
    const values: TranslationValues = {};
    names.forEach((name, index) => {
      const value = match[index + 1];
      values[name] = hasOwn(dictionary, value) ? dictionary[value] : value;
    });
    return interpolate(dictionary[key], values);
  }
  return undefined;
}

/** Translate application copy; anything without a dictionary entry is returned as is. */
export function translate(language: Language, source: string, values: TranslationValues = {}): string {
  if (language === "zh") return interpolate(source, values);
  const dictionary = dictionaries[language];
  if (hasOwn(dictionary, source)) return interpolate(dictionary[source], values);
  return translatePattern(dictionary, source) ?? interpolate(source, values);
}

let current: Language | undefined;
const listeners = new Set<() => void>();

function storedLanguage(): Language | undefined {
  try {
    const value = sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Current UI language, read lazily so api.ts can store the fragment value first. */
export function getLanguage(): Language {
  current ??= storedLanguage() ?? deviceLanguage();
  return current;
}

export function setLanguage(language: Language): void {
  if (!isLanguage(language)) return;
  try { sessionStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* storage may be unavailable */ }
  if (typeof document !== "undefined") document.documentElement.lang = localeForLanguage(language);
  if (current === language) return;
  current = language;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

const translators = new Map<Language, Translate>();

function translatorFor(language: Language): Translate {
  let translator = translators.get(language);
  if (!translator) {
    translator = (source, values) => translate(language, source, values);
    translators.set(language, translator);
  }
  return translator;
}

export const t: Translate = (source, values) => translate(getLanguage(), source, values);

export function useT(): Translate {
  const language = useLanguage();
  return useMemo(() => translatorFor(language), [language]);
}

export function useKindCopy(): Readonly<Record<Kind, KindCopy>> {
  return kindCopy[useLanguage()];
}

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Date only; an unparsable value is returned as text. */
export function formatDate(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(localeForLanguage(getLanguage()), options) : String(value);
}

/** Date and time; an unparsable value is returned as text. */
export function formatDateTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const date = toDate(value);
  return date ? date.toLocaleString(localeForLanguage(getLanguage()), options) : String(value);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeForLanguage(getLanguage()), options).format(value);
}

/** Chinese keeps the `、` separator used before localization; other languages use Intl.ListFormat. */
export function formatList(items: readonly string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  const language = getLanguage();
  if (language === "zh") return items.join("、");
  return new Intl.ListFormat(localeForLanguage(language), { type }).format(items);
}

function receiveDesktopState(event: MessageEvent<unknown>) {
  if (window.parent === window || event.source !== window.parent) return;
  const data = event.data;
  if (typeof data !== "object" || data === null) return;
  // Read the field defensively: older desktop builds send { type, busy } only.
  const state = data as { type?: unknown; language?: unknown };
  if (state.type === COZE_DESKTOP_STATE && isLanguage(state.language)) setLanguage(state.language);
}

if (typeof window !== "undefined") window.addEventListener("message", receiveDesktopState);
