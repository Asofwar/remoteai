import { useEffect } from "react";
import { Popconfirm } from "antd";
import { Download, LoaderCircle, Monitor, Power, RefreshCw, Trash2 } from "lucide-react";
import type { ComputerUseStatus } from "../../../api/computerUse";
import { translate } from "../../../i18n";
import { guiText } from "../../../i18n/guiText";
import { useGuiLanguage } from "../../../i18n/useGuiLanguage";
import { useComputerUse } from "./useComputerUse";
import { Permissions } from "./Permissions";
import styles from "./index.module.less";

interface Props { homeId: string; active: boolean; onBusyChange: (busy: boolean) => void }

export function computerUseMatches(query: string) {
  return ("computer use cua 电脑助手 桌面 应用 自动化 windows macos mac 苹果 截图 点击 输入 remote ai"
    + " assistant desktop app automation screenshot click type"
    + " компьютерный помощник рабочий стол приложения автоматизация снимок экрана")
    .includes(query.trim().toLocaleLowerCase());
}

function statusText(status: ComputerUseStatus | null) {
  if (!status) return guiText("正在检查…");
  if (!status.supported) return guiText("支持 Windows 64 位和 macOS 13 及以上系统");
  if (!status.installed) return guiText("安装后可在 Codex GUI 中使用");
  if (status.needsRepair) return guiText("安装需要修复");
  if (status.enabled && status.permissions
    && (!status.permissions.accessibility || !status.permissions.screenRecording)) {
    return guiText("已安装 · 请开启桌面操作权限");
  }
  return guiText(status.enabled ? "已启用 · 可在对话中使用" : "已停用");
}

export function ComputerUseCard({ homeId, active, onBusyChange }: Props) {
  const language = useGuiLanguage();
  const { status, error, busy, refresh, run, requestPermission } = useComputerUse(homeId, active);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  // The shared "启用" entry is the "Enabled" state label; the key-based copy holds the Enable/Uninstall actions.
  const uninstall = translate(language, "skills.official.uninstall");
  return <article className={`skill-card ${styles.card}`}>
    <div className={`skill-card-preview ${styles.preview}`}>
      <div className={styles.icon}><Monitor size={45} /></div>
      <span className="skill-official-badge">{guiText("内置插件")}</span>
      {status?.version && <span className="skill-version">CUA v{status.version}</span>}
    </div>
    <div className="skill-card-body">
      <div className="skill-card-title"><h3>{guiText("Computer Use 电脑助手")}</h3></div>
      <p>{guiText("让 Codex 查看屏幕、点击、输入和操作 Windows 或 Mac 应用，完成你交代的桌面任务。")}</p>
      <div className={styles.status} role="status">{statusText(status)}</div>
      {status?.permissions && <Permissions permissions={status.permissions} busy={busy} onRequest={requestPermission} />}
      {error && <div className={styles.error} role="alert">{guiText(error)}</div>}
      <div className="skill-card-meta"><span>Remote AI · CUA</span><span>{guiText("电脑操作")}</span></div>
      {status?.installed ? <div className="official-plugin-actions">
        <button className={`official-plugin-toggle${status.enabled ? " active" : ""}`} disabled={busy}
          onClick={() => void run(status.enabled ? "disable" : "enable")}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Power size={16} />}
          {status.needsRepair ? guiText("修复")
            : status.enabled ? guiText("停用") : translate(language, "skills.official.enable")}
        </button>
        <Popconfirm title={guiText("卸载这个目录中的电脑助手？")} description={guiText("其他目录中的安装不受影响。")}
          overlayClassName={styles.confirm} okText={uninstall} cancelText={guiText("取消")}
          onConfirm={() => void run("remove")}>
          <button className="skill-install-button uninstall" disabled={busy}><Trash2 size={16} />{uninstall}</button>
        </Popconfirm>
      </div> : <button className="skill-install-button" disabled={busy || !status?.supported}
        onClick={() => void run("install")}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
        {guiText(busy ? "正在安装，请稍候…" : "安装")}
      </button>}
      {error && <button className={styles.retry} disabled={busy} onClick={() => void refresh()}>
        <RefreshCw size={14} />{guiText("重新检查")}
      </button>}
    </div>
  </article>;
}
