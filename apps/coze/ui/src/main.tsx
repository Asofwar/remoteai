import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider, theme, type ThemeConfig } from "antd";
import type { Locale } from "antd/es/locale";
import enUS from "antd/locale/en_US";
import ruRU from "antd/locale/ru_RU";
import zhCN from "antd/locale/zh_CN";
import { localeForLanguage, useLanguage, type Language } from "./i18n";
import { Studio } from "./Studio";
import "./styles.css";

const antdLocales: Record<Language, Locale> = { zh: zhCN, en: enUS, ru: ruRU };
const dark = sessionStorage.getItem("coze-theme") === "dark";
document.documentElement.dataset.theme = dark ? "dark" : "light";
const themeConfig: ThemeConfig = { algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: { colorPrimary: "#635bdb", borderRadius: 9 } };

/** Switches the antd locale in place, so a language change never remounts the studio or loses drafts. */
function Root() {
  const language = useLanguage();
  useEffect(() => { document.documentElement.lang = localeForLanguage(language); }, [language]);
  return <ConfigProvider locale={antdLocales[language]} theme={themeConfig}>
    <AntApp><Studio /></AntApp>
  </ConfigProvider>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
