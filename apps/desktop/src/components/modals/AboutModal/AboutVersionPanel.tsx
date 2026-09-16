import { Check, CircleAlert, Download, LoaderCircle } from "lucide-react";
import type { Translate } from "../../../i18n";
import type { HelpVersionState } from "../HelpModal";

interface AboutVersionPanelProps {
  version: string;
  state: HelpVersionState;
  t: Translate;
}

function versionPresentation(state: HelpVersionState, t: Translate) {
  switch (state.status) {
    case "latest":
      return { icon: Check, label: t("help.version.latest"), description: t("about.version.latest") };
    case "available":
      return { icon: Download, label: t("help.version.available", { version: state.latestVersion }),
        description: t("about.version.available") };
    case "error":
      return { icon: CircleAlert, label: t("help.version.error"), description: t("about.version.error") };
    case "checking":
      return { icon: LoaderCircle, label: t("help.version.checking"), description: t("about.version.checking") };
  }
}

function AboutMountains() {
  return <div className="about-version-art" aria-hidden="true">
    <svg viewBox="0 0 400 130" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id="about-mountain-fill" x1="0" y1="0" x2="0.3" y2="1">
          <stop stopColor="#7bceba" stopOpacity=".55" />
          <stop offset="1" stopColor="#9ed5c8" stopOpacity=".1" />
        </linearGradient>
      </defs>
      <path d="M0 105 112 24Q124 15 134 27L226 130H0Z" fill="url(#about-mountain-fill)" />
      <path d="M0 29Q13 31 24 45L99 130H0Z" fill="#73c5b2" opacity=".2" />
      <path d="m101 130 76-61q13-11 26-1l99 62Z" fill="url(#about-mountain-fill)" />
      <path d="m232 130 75-44q13-9 25-1l68 45Z" fill="url(#about-mountain-fill)" />
      <path d="m68 130 31-28q6-6 12 0l31 28Z" fill="#7cc7b7" opacity=".25" />
      <path d="m112 24 18 106h96L134 27Q124 15 112 24Zm195 62-31 44h124l-68-45q-12-8-25 1Z"
        fill="#b9e3da" opacity=".2" />
    </svg>
    <p>Small Switch<br />Bigger Possibilities<span /></p>
  </div>;
}

export function AboutVersionPanel({ version, state, t }: AboutVersionPanelProps) {
  const { icon: StatusIcon, label, description } = versionPresentation(state, t);
  return <div className="about-version-panel">
    <div className="about-version-copy">
      <span>{t("about.currentVersion")}</span>
      <strong>v{version}</strong>
      <p>{description}</p>
    </div>
    <span className={`about-version-status ${state.status}`} role="status" aria-live="polite">
      <StatusIcon aria-hidden="true" />{label}
    </span>
    <AboutMountains />
  </div>;
}
