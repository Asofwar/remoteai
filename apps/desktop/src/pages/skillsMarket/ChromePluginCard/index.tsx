import { useEffect, useState } from "react";
import { Globe, LoaderCircle, Power, Settings2 } from "lucide-react";
import { useChromePlugin } from "./useChromePlugin";
import { ChromeSetup } from "./ChromeSetup";
import type { ChromePluginStatus } from "../../../api/chromePlugin";
import { translate } from "../../../i18n";
import { guiText } from "../../../i18n/guiText";
import { useGuiLanguage } from "../../../i18n/useGuiLanguage";
import styles from "./index.module.less";

interface Props {
  homeId: string;
  active: boolean;
  onBusyChange: (busy: boolean) => void;
}

export function chromePluginMatches(query: string) {
  return "chrome 浏览器助手 browser assistant extension remote ai 点击 输入 截图 браузерный помощник расширение"
    .includes(query.trim().toLocaleLowerCase());
}

function connectionText(status: ChromePluginStatus | null, busy: boolean) {
  if (!status) return guiText("正在检查…");
  if (!status.supported) return guiText("当前系统暂不支持");
  if (!status.installed) return guiText(busy ? "正在准备浏览器助手…" : "尚未就绪，请点击启用");
  if (status.needsRepair) return guiText("插件设置需要修复");
  if (!status.enabled) return guiText("已停用");
  if (!status.connectedBrowsers) return guiText("等待 Chrome 连接");
  if (!status.activeBrowsers) return guiText("浏览器控制已暂停");
  return guiText("已连接 {count} 个浏览器", { count: status.connectedBrowsers });
}

export function ChromePluginCard({ homeId, active, onBusyChange }: Props) {
  const language = useGuiLanguage();
  const { status, error, busy, refresh, run } = useChromePlugin(homeId, active);
  const [setup, setSetup] = useState(false);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  return <article className={`skill-card ${styles.card}`}>
    <div className={`skill-card-preview ${styles.preview}`}>
      <div className={styles.icon}><Globe size={45} /></div>
      <span className="skill-official-badge">{guiText("内置插件")}</span>
      {status?.version && <span className="skill-version">v{status.version}</span>}
    </div>
    <div className="skill-card-body">
      <div className="skill-card-title"><h3>{guiText("Chrome 浏览器助手")}</h3></div>
      <p>{guiText("在你允许的网站上读取页面、点击、输入和截图，支持已有标签页。")}</p>
      <div className={styles.connection} role="status">{connectionText(status, busy)}</div>
      {error && <div className={styles.error} role="alert">{guiText(error)}</div>}
      <div className="skill-card-meta"><span>Remote AI</span><span>{guiText("浏览器")}</span></div>
      <div className={styles.cardActions}>
        <button className="refresh-all" disabled={busy || !status?.supported || !status.installed}
          onClick={() => setSetup(true)}>
          <Settings2 size={15} />{guiText("安装与连接")}
        </button>
        <button className={`official-plugin-toggle${status?.enabled ? " active" : ""}`}
          disabled={busy || !status?.supported}
          onClick={() => void run(status?.enabled ? "disable" : "enable")}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Power size={16} />}
          {/* The shared "启用" entry is the "Enabled" state label; this is the Enable action. */}
          {status?.enabled ? guiText("停用") : translate(language, "skills.official.enable")}
        </button>
      </div>
    </div>
    {setup && status && <ChromeSetup status={status} busy={busy} error={error} onClose={() => setSetup(false)}
      onAction={run} onRefresh={refresh} />}
  </article>;
}
