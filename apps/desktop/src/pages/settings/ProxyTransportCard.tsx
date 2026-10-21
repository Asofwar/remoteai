import { InputNumber } from "antd";
import { Network } from "lucide-react";
import { MAX_PROXY_TRANSPORT_COUNT } from "../../api/proxyTransport";
import type { SettingsPageProps } from "./types";

type Props = Pick<SettingsPageProps, "proxyTransport" | "t">;

export function ProxyTransportCard({ settings }: { settings: Props }) {
  const { proxyTransport: transport, t } = settings;
  return (
    <section className="settings-card">
      <div className="settings-icon"><Network size={23} /></div>
      <div className="settings-card-content">
        <div className="settings-card-copy">
          <h3>{t("settings.proxyTransport.title")}</h3>
          <p>{t("settings.proxyTransport.description")}</p>
        </div>
        <div className="settings-field">
          <label htmlFor="proxy-network-retries">{t("settings.proxyTransport.retries")}</label>
          <InputNumber id="proxy-network-retries" min={0} max={MAX_PROXY_TRANSPORT_COUNT} precision={0}
            value={transport.settings.networkRetryCount} disabled={transport.loading}
            onChange={(value) => { void transport.updateCount("networkRetryCount", value); }} />
        </div>
        <div className="settings-field">
          <label htmlFor="proxy-max-redirects">{t("settings.proxyTransport.redirects")}</label>
          <InputNumber id="proxy-max-redirects" min={0} max={MAX_PROXY_TRANSPORT_COUNT} precision={0}
            value={transport.settings.maxRedirects} disabled={transport.loading}
            onChange={(value) => { void transport.updateCount("maxRedirects", value); }} />
        </div>
      </div>
    </section>
  );
}
