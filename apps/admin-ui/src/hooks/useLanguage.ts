import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, isLanguage, type Language } from "../i18n";

const documentLanguages: Record<Language, string> = {
  zh: "zh-CN",
  en: "en",
  ru: "ru",
};

function preferredLanguage(): Language {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("en")) return "en";
  if (browserLanguage.startsWith("ru")) return "ru";
  return DEFAULT_LANGUAGE;
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(preferredLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = documentLanguages[language];
  }, [language]);

  return [language, setLanguage] as const;
}
