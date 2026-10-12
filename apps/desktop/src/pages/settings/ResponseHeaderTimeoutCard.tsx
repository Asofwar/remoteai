import { TimerReset } from "lucide-react";
import { MAX_RESPONSE_HEADER_TIMEOUT_SECONDS } from "../../api/responseHeaderTimeout";
import { DurationTimePicker } from "./DurationTimePicker";
import type { SettingsPageProps } from "./types";

type ResponseHeaderTimeoutCardProps = Pick<SettingsPageProps, "responseHeaderTimeout" | "t">;

export function ResponseHeaderTimeoutCard({ settings }: { settings: ResponseHeaderTimeoutCardProps }) {
  const { responseHeaderTimeout: timeout, t } = settings;
  return (
    <section className="settings-card">
      <div className="settings-icon"><TimerReset size={23} /></div>
      <div className="settings-card-content">
        <div className="settings-card-copy">
          <h3>{t("settings.responseHeaderTimeout.title")}</h3>
          <p>{t("settings.responseHeaderTimeout.description")}</p>
        </div>
        <div className="settings-field">
          <label htmlFor="response-header-timeout-seconds">{t("settings.responseHeaderTimeout.duration")}</label>
          <DurationTimePicker
            id="response-header-timeout-seconds"
            value={timeout.settings.timeoutSeconds}
            disabled={timeout.loading}
            maxSeconds={MAX_RESPONSE_HEADER_TIMEOUT_SECONDS}
            onChange={(value) => { void timeout.updateSeconds(value); }}
          />
        </div>
      </div>
    </section>
  );
}
