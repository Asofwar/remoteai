import {
  ArrowRight, Download, Github, Heart, MessageSquareText, RotateCcw, Scale, Server, ShieldCheck, X,
} from "lucide-react";
import type { Translate } from "../../../i18n";
import type { HelpVersionState } from "../HelpModal";
import { AboutHero } from "./AboutHero";
import { AboutVersionPanel } from "./AboutVersionPanel";
import styles from "./index.module.less";

interface AboutModalProps {
  logoUrl: string;
  onClose: () => void;
  onFeedback: () => void;
  onOpenRepository: () => void;
  onUpdate: () => void;
  version: string;
  versionState: HelpVersionState;
  t: Translate;
}

function AboutPrinciples({ t }: { t: Translate }) {
  const principles = [
    { name: "local", icon: ShieldCheck, title: t("about.local.title"), description: t("about.local.description") },
    { name: "workflow", icon: RotateCcw,
      title: t("about.workflow.title"), description: t("about.workflow.description") },
    { name: "ecosystem", icon: Server,
      title: t("about.ecosystem.title"), description: t("about.ecosystem.description") },
  ];
  return <div className="about-principles">
    {principles.map(({ name, icon: Icon, title, description }) => (
      <article key={name} className={`about-principle about-principle-${name}`}>
        <div className="about-principle-icon"><Icon aria-hidden="true" strokeWidth={1.9} /></div>
        <div className="about-principle-copy"><h3>{title}</h3><p>{description}</p></div>
      </article>
    ))}
  </div>;
}

function AboutLegal({ t }: { t: Translate }) {
  return <footer className="about-legal">
    <Scale className="about-license-icon" aria-hidden="true" strokeWidth={1.7} />
    <div className="about-legal-copy">
      <strong>{t("about.license")}</strong>
      <p>{t("about.disclaimer")}</p>
    </div>
    <div className="about-signoff">
      <span>Made with</span><Heart aria-label={t("about.madeWithLove")} /><span>for a more open AI future.</span>
    </div>
  </footer>;
}

export function AboutModal({ logoUrl, onClose, onFeedback, onOpenRepository, onUpdate,
  version, versionState, t }: AboutModalProps) {
  return (
    <div className={`${styles.styleScope} modal-backdrop`} onClick={onClose}>
      <section className="modal about-modal" role="dialog" aria-modal="true"
        aria-labelledby="about-modal-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label={t("about.close")} onClick={onClose}>
          <X aria-hidden="true" strokeWidth={1.5} />
        </button>
        <AboutHero logoUrl={logoUrl} t={t} />
        <div className="about-body">
          <AboutPrinciples t={t} />
          <AboutVersionPanel version={version} state={versionState} t={t} />
          <div className="about-actions">
            <button type="button" className="about-repository" onClick={onOpenRepository}>
              <Github aria-hidden="true" />{t("about.repository")}<ArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={onFeedback}>
              <MessageSquareText aria-hidden="true" />{t("help.feedback")}<ArrowRight aria-hidden="true" />
            </button>
            {versionState.status === "available" && (
              <button type="button" className="about-update" onClick={onUpdate}>
                <Download aria-hidden="true" />{t("update.download")}
              </button>
            )}
          </div>
          <AboutLegal t={t} />
        </div>
      </section>
    </div>
  );
}
