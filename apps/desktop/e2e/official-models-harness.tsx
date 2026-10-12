import React from "react";
import { createRoot } from "react-dom/client";
import { App, ConfigProvider } from "antd";
import { OfficialModelsPage } from "../../admin-ui/src/pages/OfficialModelsPage";
import { I18nProvider } from "../../admin-ui/src/i18n-context";
import "antd/dist/reset.css";

const query = new URLSearchParams(location.search);
const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json" } });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(typeof value === "object" && value && "message" in value
    ? String(value.message) : "Request failed");
  return value as T;
};
createRoot(document.getElementById("root")!).render(<ConfigProvider><App>
  <I18nProvider language={query.has("en") ? "en" : "zh"} onLanguageChange={() => {}}>
    <main style={{ padding: 16, maxWidth: 1200, margin: "auto" }}>
      <OfficialModelsPage api={api} canManage={!query.has("readonly")} />
    </main>
  </I18nProvider>
</App></ConfigProvider>);
