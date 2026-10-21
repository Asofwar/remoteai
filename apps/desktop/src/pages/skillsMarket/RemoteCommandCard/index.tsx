import { useEffect } from "react";
import { Popconfirm } from "antd";
import { Download, LoaderCircle, Power, RefreshCw, Terminal, Trash2 } from "lucide-react";
import type { RemoteCommandStatus } from "../../../api/remoteCommand";
import { translate } from "../../../i18n";
import { guiText } from "../../../i18n/guiText";
import { useGuiLanguage } from "../../../i18n/useGuiLanguage";
import { useRemoteCommand } from "./useRemoteCommand";
import styles from "./index.module.less";

interface Props { homeId: string; active: boolean; onBusyChange: (busy: boolean) => void }

export function remoteCommandMatches(query: string) {
  return ("remote command 远程命令 电脑 主机 诊断 分析 终端 powershell shell windows macos linux remote ai"
    + " commands diagnostics terminal"
    + " удалённые команды удаленные команды диагностика терминал компьютер")
    .includes(query.trim().toLocaleLowerCase());
}

function statusText(status: RemoteCommandStatus | null) {
  if (!status) return guiText("正在检查…");
  if (!status.installed) return guiText("两台电脑安装后，即可在对话中使用");
  if (status.needsRepair) return guiText("安装需要修复");
  return guiText(status.enabled ? "已启用 · 可调用和接收远程命令" : "已停用 · 无法调用或接收远程命令");
}

export function RemoteCommandCard({ homeId, active, onBusyChange }: Props) {
  const language = useGuiLanguage();
  const { status, error, busy, refresh, run } = useRemoteCommand(homeId, active);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  // The shared "启用" entry is the "Enabled" state label; the key-based copy holds the Enable/Uninstall actions.
  const uninstall = translate(language, "skills.official.uninstall");
  return <article className={`skill-card ${styles.card}`}>
    <div className={`skill-card-preview ${styles.preview}`}>
      <div className={styles.icon}><Terminal size={45} /></div>
      <span className="skill-official-badge">{guiText("内置插件")}</span>
      {status?.version && <span className="skill-version">v{status.version}</span>}
    </div>
    <div className="skill-card-body">
      <div className="skill-card-title"><h3>{guiText("远程命令")}</h3></div>
      <p>{guiText("让 AI 在同账号的电脑间执行命令、排查问题，停用即可停止访问。")}</p>
      <div className={styles.status} role="status">{statusText(status)}</div>
      {error && <div className={styles.error} role="alert">{guiText(error)}</div>}
      <div className="skill-card-meta"><span>Remote AI</span><span>{guiText("远程诊断")}</span></div>
      {status?.installed ? <div className="official-plugin-actions">
        <button className={`official-plugin-toggle${status.enabled ? " active" : ""}`} disabled={busy}
          onClick={() => void run(status.enabled ? "disable" : "enable")}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Power size={16} />}
          {status.needsRepair ? guiText("修复")
            : status.enabled ? guiText("停用") : translate(language, "skills.official.enable")}
        </button>
        <Popconfirm title={guiText("卸载远程命令插件？")} description={guiText("卸载后，此安装将无法调用或接收远程命令。")}
          overlayClassName={styles.confirm} okText={uninstall} cancelText={guiText("取消")}
          onConfirm={() => void run("remove")}>
          <button className="skill-install-button uninstall" disabled={busy}><Trash2 size={16} />{uninstall}</button>
        </Popconfirm>
      </div> : <button className="skill-install-button" disabled={busy || !status}
        onClick={() => void run("install")}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
        {guiText(busy ? "正在安装…" : "安装")}
      </button>}
      {error && <button className={styles.retry} disabled={busy} onClick={() => void refresh()}>
        <RefreshCw size={14} />{guiText("重新检查")}
      </button>}
    </div>
  </article>;
}
