import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Popconfirm } from "antd";
import {
  COZE_DESKTOP_READY, COZE_DESKTOP_STATE, COZE_DESKTOP_STOP, COZE_DESKTOP_STOP_READY, type CozeDesktopState,
} from "../../../../../shared/coze/desktopBridge";
import { guiText } from "../../i18n/guiText";
import styles from "./CozePage.module.less";

interface CozeWorkspaceProps {
  url: string;
  busy: boolean;
  error: string;
  onStop: () => Promise<void>;
}

export function CozeWorkspace({ url, busy, error, onStop }: CozeWorkspaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [readyUrl, setReadyUrl] = useState<string>();
  const origin = new URL(url).origin;
  const sendState = useCallback(() => {
    const state: CozeDesktopState = { type: COZE_DESKTOP_STATE, busy };
    frame.current?.contentWindow?.postMessage(state, origin);
  }, [busy, origin]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (event.data === COZE_DESKTOP_READY) sendState();
      if (event.data === COZE_DESKTOP_STOP_READY) setReadyUrl(url);
      if (event.data === COZE_DESKTOP_STOP && !busy) void onStop();
    };
    window.addEventListener("message", receive);
    sendState();
    return () => window.removeEventListener("message", receive);
  }, [busy, onStop, origin, sendState, url]);
  return <div className={styles.workspace}>
    {error && <Alert type="error" message={error} />}
    {(readyUrl !== url || !!error) && <div className={styles.workspaceControls}>
      <Popconfirm title={guiText("停止 Coze？已保存的内容会保留。")}
        okText={guiText("停止")} cancelText={guiText("取消")} disabled={busy}
        styles={{ root: { maxWidth: 400 } }} onConfirm={onStop}>
        <Button danger loading={busy}>{guiText("停止 Coze")}</Button>
      </Popconfirm>
    </div>}
    <iframe key={url} ref={frame} title="Coze" src={url}
      onLoad={() => { setReadyUrl(undefined); sendState(); }} onError={() => setReadyUrl(undefined)}
      sandbox="allow-scripts allow-same-origin allow-downloads" />
  </div>;
}
