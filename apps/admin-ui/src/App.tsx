import { App as AntApp, ConfigProvider, theme } from "antd";
import type { ConfigProviderProps } from "antd";
import enUS from "antd/locale/en_US";
import ruRU from "antd/locale/ru_RU";
import zhCN from "antd/locale/zh_CN";
import { AdminConsole } from "./AdminConsole";
import { PasswordResetPage } from "./pages/PasswordResetPage";
import { I18nProvider } from "./i18n-context";
import { useLanguage } from "./hooks/useLanguage";
import { useThemeMode } from "./hooks/useThemeMode";
import type { Language } from "./i18n";

const antdLocales: Record<Language, ConfigProviderProps["locale"]> = { zh: zhCN, en: enUS, ru: ruRU };

export function App() {
  const [dark, setDark] = useThemeMode();
  const [language, setLanguage] = useLanguage();
  const passwordResetPage = window.location.pathname.replace(/\/+$/, "").endsWith("/admin/reset-password");

  return (
    <ConfigProvider
      locale={antdLocales[language]}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#1769e0",
          borderRadius: 8,
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        },
      }}
    >
      <I18nProvider language={language} onLanguageChange={setLanguage}>
        <AntApp>
          {passwordResetPage
            ? <PasswordResetPage />
            : <AdminConsole dark={dark} onThemeChange={setDark} />}
        </AntApp>
      </I18nProvider>
    </ConfigProvider>
  );
}
