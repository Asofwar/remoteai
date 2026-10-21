import { ArrowDown, ArrowUpRight, Check, Github } from 'lucide-react';
import { Button } from 'antd';
import { copy, homeFaqs } from '../content/copy';
import { features } from '../content/features';
import type { Language } from '../content/types';
import { href, LINKS } from '../lib/site';
import { Actions, ClosingCta, Faq } from '../components/Shared';
import { ConnectionIllustration, ProductImage } from '../components/ProductFigure';
import { FeatureCard } from '../components/FeatureCard';
import { FeatureIcon } from '../components/FeatureIcon';

function Hero({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section className="hero shell">
      <div className="hero-orbit" aria-hidden="true" />
      <a className="hero-badge" href={LINKS.repository}>
        <span />
        {t.home.badge}
        <ArrowUpRight size={14} />
      </a>
      <h1>
        {t.home.title[0]}
        <br />
        <span>{t.home.title[1]}</span>
      </h1>
      <p className="hero-description">{t.home.description}</p>
      <Actions language={language} />
      <p className="platform-caption">
        {t.home.platforms}
        <span className="caption-divider" />
        Apache-2.0
      </p>
      <a className="hero-explore" href="#workspace">
        {t.home.explore}
        <ArrowDown size={16} />
      </a>
    </section>
  );
}

function Workspace({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section id="workspace" className="workspace-section shell">
      <div className="workspace-stage">
        <div className="stage-heading">
          <span className="stage-mark">
            <span /> REMOTE AI
          </span>
          <span>{t.home.stageNote}</span>
        </div>
        <div className="stage-image">
          <ProductImage name="codex-gui" alt={features[0].imageAlt[language]} priority />
        </div>
        <div className="stage-footer">
          <span>{t.home.stageTitle}</span>
          <span>01 — WORKSPACE</span>
        </div>
      </div>
      <div className="value-strip">
        {t.home.pillars.map((text) => (
          <span key={text}>
            <Check size={16} />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}

function CoreFeatures({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section className="section shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.home.introLabel}</p>
          <h2>{t.home.coreTitle}</h2>
        </div>
        <p>{t.home.coreBody}</p>
      </div>
      <div className="core-grid">
        <a className="core-main" href={href(language, 'features/codex-gui/')}>
          <div className="core-main-top">
            <FeatureIcon slug="codex-gui" size={28} />
            <ArrowUpRight size={24} />
          </div>
          <h3>{language === 'zh' ? '好的想法，值得一个好用的工作台。' : 'Good ideas deserve a great workspace.'}</h3>
          <p>{features[0][language].summary}</p>
          <div className="workflow-steps">
            {(language === 'zh' ? ['描述目标', '跟进执行', '审阅改动'] : ['Describe', 'Follow', 'Review']).map(
              (step, index) => (
                <div key={step}>
                  <span>0{index + 1}</span>
                  {step}
                  <ArrowUpRight size={16} />
                </div>
              ),
            )}
          </div>
          <span className="core-main-bottom">
            CODEX GUI <span>↗</span>
          </span>
        </a>
        <div className="core-side">
          {[features[3], features[4], features[5]].map((feature) => (
            <FeatureCard key={feature.slug} feature={feature} language={language} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RemoteSection({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section className="remote-section">
      <div className="shell remote-inner">
        <div className="remote-copy">
          <p className="eyebrow">{t.home.remoteLabel}</p>
          <h2>{t.home.remoteTitle}</h2>
          <p>{t.home.remoteBody}</p>
          <Button size="large" href={href(language, 'features/remote-workspace/')}>
            {t.home.remoteLink}
            <ArrowUpRight size={17} />
          </Button>
          <small>{t.home.remoteNote}</small>
        </div>
        <ConnectionIllustration language={language} />
      </div>
    </section>
  );
}

function DetailsSection({ language }: { language: Language }) {
  const t = copy(language);
  const picks = features.filter((feature) => ['themes', 'skills', 'conversations'].includes(feature.slug));
  return (
    <section className="section shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THOUGHTFULLY CONNECTED</p>
          <h2>{t.home.detailsTitle}</h2>
        </div>
        <p>{t.home.detailsBody}</p>
      </div>
      <div className="feature-grid">
        {picks.map((feature) => (
          <FeatureCard feature={feature} language={language} visual key={feature.slug} />
        ))}
      </div>
      <a className="text-link all-features-link" href={href(language, 'features/')}>
        {t.common.all}
        <ArrowUpRight size={18} />
      </a>
      <div className="open-source-banner">
        <Github size={36} strokeWidth={1.4} />
        <div>
          <h3>{language === 'zh' ? '开放的不只是代码，还有可能性。' : 'Open code. Open possibilities.'}</h3>
          <p>
            {language === 'zh'
              ? '查看源码，提交反馈，或一起完善下一个版本。'
              : 'Read the source, share feedback, or help shape the next release.'}
          </p>
        </div>
        <a className="text-link" href={LINKS.repository}>
          GitHub
          <ArrowUpRight size={18} />
        </a>
      </div>
    </section>
  );
}

export function Home({ language }: { language: Language }) {
  return (
    <>
      <Hero language={language} />
      <Workspace language={language} />
      <CoreFeatures language={language} />
      <RemoteSection language={language} />
      <DetailsSection language={language} />
      <div className="shell">
        <Faq items={homeFaqs[language]} title={copy(language).home.faqTitle} />
      </div>
      <ClosingCta language={language} />
    </>
  );
}
