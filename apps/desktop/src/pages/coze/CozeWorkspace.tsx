import { useCallback, useEffect, useRef } from "react";
import { Alert } from "antd";
import {
  COZE_DESKTOP_READY, COZE_DESKTOP_STATE, COZE_DESKTOP_STOP, type CozeDesktopState,
} from "../../../../../shared/coze/desktopBridge";
import styles from "./CozePage.module.less";

interface CozeWorkspaceProps {
  url: string;
  busy: boolean;
  error: string;
  onStop: () => Promise<void>;
}

export function CozeWorkspace({ url, busy, error, onStop }: CozeWorkspaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(url).origin;
  const sendState = useCallback(() => {
    const state: CozeDesktopState = { type: COZE_DESKTOP_STATE, busy };
    frame.current?.contentWindow?.postMessage(state, origin);
  }, [busy, origin]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (event.data === COZE_DESKTOP_READY) sendState();
      if (event.data === COZE_DESKTOP_STOP && !busy) void onStop();
    };
    window.addEventListener("message", receive);
    sendState();
    return () => window.removeEventListener("message", receive);
  }, [busy, onStop, origin, sendState]);
  return <div className={styles.workspace}>
    {error && <Alert type="error" message={error} />}
    <iframe ref={frame} title="Coze" src={url} onLoad={sendState}
      sandbox="allow-scripts allow-same-origin allow-downloads" />
  </div>;
}
