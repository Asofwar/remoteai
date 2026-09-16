import { Modal } from "antd";
import { useState } from "react";
import { Check, Copy, FolderOpen, ExternalLink, RefreshCw } from "lucide-react";
import type { ChromePluginAction, ChromePluginStatus } from "../../../api/chromePlugin";
import styles from "./index.module.less";

interface Props {
  status: ChromePluginStatus;
  busy: boolean;
  error: string;
  onClose: () => void;
  onAction: (action: ChromePluginAction) => Promise<boolean>;
  onRefresh: () => Promise<void>;
}

export function ChromeSetup({ status, busy, error, onClose, onAction, onRefresh }: Props) {
  const [addressCopied, setAddressCopied] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copyPath = async () => {
    setCopyError("");
    setPathCopied(false);
    try {
      await navigator.clipboard.writeText(status.extensionDirectory);
      setPathCopied(true);
    } catch {
      setCopyError("复制失败，请手动选择并复制路径。");
    }
  };
  const openChrome = async () => {
    setAddressCopied(false);
    setAddressCopied(await onAction("openExtensions"));
  };
  return <Modal open title="连接 Chrome 浏览器助手" width={680} footer={null} onCancel={onClose}>
    <div className={styles.setup}>
      <p>首次使用时，需要在 Chrome 中添加扩展。无需安装 ChatGPT。</p>
      <ol>
        <li>点击下方按钮，在 Chrome 地址栏粘贴并回车，打开扩展管理页。</li>
        <li>开启右上角的“开发者模式”。</li>
        <li>选择“加载已解压的扩展程序”，粘贴下方路径并选择该目录。</li>
        <li>在 Chrome 工具栏打开“Codex Switch 浏览器助手”，确认显示“已连接”。</li>
      </ol>
      <button type="button" className={styles.path} aria-label="复制扩展目录路径" onClick={() => void copyPath()}>
        <span className={styles.pathText}>{status.extensionDirectory}</span>
        <span className={styles.copyLabel} role="status">
          {pathCopied ? <Check size={15} /> : <Copy size={15} />}
          {pathCopied ? "已复制" : "点击复制"}
        </span>
      </button>
      {copyError && <p className={styles.error} role="alert">{copyError}</p>}
      <div className={styles.setupActions}>
        <button className="primary-button" disabled={busy} onClick={() => void openChrome()}>
          <ExternalLink size={15} />打开 Chrome 并复制地址
        </button>
        <button className="refresh-all" disabled={busy} onClick={() => void onAction("openFolder")}>
          <FolderOpen size={15} />打开扩展目录
        </button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {addressCopied && !error && <p className={`${styles.hint} ${styles.feedback}`} role="status">
        已复制地址，请在 Chrome 地址栏粘贴并回车。
      </p>}
      <p className={styles.hint}>也可在 Chrome 地址栏输入 <code>chrome://extensions/</code> 并回车。</p>
      <p className={styles.connection} role="status">
        {status.connectedBrowsers > 0 ? `已连接 ${status.connectedBrowsers} 个浏览器` : "等待 Chrome 连接…"}
      </p>
      <button className="refresh-all" disabled={busy} onClick={() => void onRefresh()}>
        <RefreshCw size={15} />检查连接
      </button>
      <p className={styles.hint}>
        在 Chrome 中允许网站访问后，开启新任务即可使用。默认允许所有网站，也可在浏览器助手中改为逐站确认。
      </p>
    </div>
  </Modal>;
}
