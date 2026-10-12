import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { ProxySessionManager } from "../src/components/ProxySessionManager";
import { useResponseHeaderTimeout } from "../src/hooks/useResponseHeaderTimeout";
import { ResponseHeaderTimeoutCard } from "../src/pages/settings/ResponseHeaderTimeoutCard";
import settingsStyles from "../src/pages/SettingsPage/index.module.less";
import { translate, type Translate } from "../src/i18n";
import "../src/styles.css";

const translateText: Translate = (key, values) => translate("zh", key, values);

function Harness() {
  const [notice, setNotice] = useState("");
  const [clicks, setClicks] = useState(0);
  const timeout = useResponseHeaderTimeout(setNotice);
  return <ConfigProvider theme={{ token: { motion: false } }}>
    <main style={{ padding: 24, maxWidth: 1100, margin: "auto" }}>
      <div className={settingsStyles.styleScope}>
        <ResponseHeaderTimeoutCard settings={{ responseHeaderTimeout: timeout, t: translateText }} />
      </div>
      <p role="status">{notice}</p>
      <button onClick={() => setClicks((value) => value + 1)}>Click {clicks}</button>
      <div style={{ height: 350, marginTop: 24 }}><ProxySessionManager t={translateText} /></div>
    </main>
  </ConfigProvider>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
