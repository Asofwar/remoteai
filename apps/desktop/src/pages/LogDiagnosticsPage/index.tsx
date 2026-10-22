import { Button, Tabs } from "antd";
import { FileDown } from "lucide-react";
import { ProxySessionManager } from "../../components/ProxySessionManager";
import type { Language, Translate } from "../../i18n";
import { ErrorLogsPage } from "../ErrorLogsPage";
import styles from "./index.module.less";

export type LogDiagnosticsTab = "errorLogs" | "proxySessions";

interface LogDiagnosticsPageProps {
  activeTab: LogDiagnosticsTab;
  language: Language;
  onTabChange: (tab: LogDiagnosticsTab) => void;
  t: Translate;
  onExportLogs: () => void;
  exportingLogs: boolean;
}

export function LogDiagnosticsPage({ activeTab, language, onTabChange, t,
  onExportLogs, exportingLogs }: LogDiagnosticsPageProps) {
  return (
    <Tabs className={styles.tabs} activeKey={activeTab} destroyOnHidden animated={false}
      renderTabBar={(props, TabBar) => (
        <div className={`topbar ${styles.header}`} data-tauri-drag-region>
          <div className={styles.heading}>
            <span className="eyebrow">{t("logDiagnostics.eyebrow")}</span>
            <h1>{t("logDiagnostics.title")}</h1>
          </div>
          <TabBar {...props} className={styles.tabBar} />
          {activeTab === "errorLogs" && <Button className={styles.exportButton} icon={<FileDown size={16} />}
            loading={exportingLogs} onClick={onExportLogs}>{t("settings.logs.export")}</Button>}
        </div>
      )}
      onChange={(key) => onTabChange(key as LogDiagnosticsTab)} items={[
        {
          key: "errorLogs", label: t("errorLogs.title"),
          children: <ErrorLogsPage language={language} t={t} />,
        },
        {
          key: "proxySessions", label: t("nav.proxySessions"),
          children: <ProxySessionManager t={t} />,
        },
      ]} />
  );
}
