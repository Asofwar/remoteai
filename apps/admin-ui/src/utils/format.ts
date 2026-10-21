import { DEFAULT_LANGUAGE, type Language } from "../i18n";

const dateLocales: Record<Language, string> = {
  zh: "zh-CN",
  en: "en-US",
  ru: "ru-RU",
};

export function formatDate(value?: string | null, language: Language = DEFAULT_LANGUAGE) {
  if (!value) return "-";
  return new Date(value).toLocaleString(dateLocales[language]);
}
