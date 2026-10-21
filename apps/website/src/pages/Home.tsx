import { ArrowUpRight, Github } from 'lucide-react';
import { Button } from 'antd';
import { copy, homeFaqs } from '../content/copy';
import { features } from '../content/features';
import type { Language } from '../content/types';
import { href, LINKS } from '../lib/site';
import { ui } from '../lib/ui-text';
import { ClosingCta, Faq } from '../components/Shared';
import { ConnectionIllustration } from '../components/ProductFigure';
import { FeatureCard } from '../components/FeatureCard';
import { HomeHero } from '../components/HomeHero';
import { HomeShowcase } from '../components/HomeShowcase';
import { HomeStories } from '../components/HomeStories';

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
            <ArrowUpRight size={17} aria-hidden="true" />
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
  const picks = features.filter((feature) => ['accounts', 'themes', 'token-usage'].includes(feature.slug));
  return (
    <section className="section shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKE IT YOUR WORKSPACE</p>
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
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
      <div className="open-source-banner">
        <Github size={36} strokeWidth={1.4} aria-hidden="true" />
        <div>
          <h3>{ui(language, 'openCodeTitle')}</h3>
          <p>{ui(language, 'openCodeBody')}</p>
        </div>
        <a className="text-link" href={LINKS.repository}>
          GitHub
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

export function Home({ language }: { language: Language }) {
  return (
    <>
      <div className="home-intro">
        <HomeHero language={language} />
        <HomeShowcase language={language} />
      </div>
      <HomeStories language={language} />
      <RemoteSection language={language} />
      <DetailsSection language={language} />
      <div className="shell">
        <Faq items={homeFaqs[language]} title={copy(language).home.faqTitle} />
      </div>
      <ClosingCta language={language} />
    </>
  );
}
