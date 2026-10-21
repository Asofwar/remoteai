import { Button } from 'antd';
import { Apple, ArrowRight, ArrowUpRight, Download as DownloadIcon, Monitor, Terminal } from 'lucide-react';
import { copy } from '../content/copy';
import type { Language } from '../content/types';
import { href, LINKS } from '../lib/site';
import { ConnectionIllustration } from '../components/ProductFigure';

const platformIcons = [Monitor, Apple, Terminal];

export function Download({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <div className="shell download-page">
      <header className="page-heading">
        <p className="eyebrow">{t.download.label}</p>
        <h1>{t.download.title}</h1>
        <p>{t.download.description}</p>
        <a className="text-link" href={LINKS.releases}>
          {t.download.releases}
          <ArrowUpRight size={16} />
        </a>
      </header>
      <section aria-label={t.download.platform} className="download-grid">
        {t.download.cards.map((card, index) => {
          const Icon = platformIcons[index];
          return (
            <article className="download-card" key={card.name}>
              <Icon size={42} strokeWidth={1.3} aria-hidden="true" />
              <h2>{card.name}</h2>
              <p>{card.detail}</p>
              <span>{card.packages}</span>
              <Button size="large" type="primary" href={LINKS.latest} aria-label={`${card.name}: ${t.download.latest}`}>
                <DownloadIcon size={16} />
                {t.download.latest}
              </Button>
            </article>
          );
        })}
      </section>
      <p className="download-availability">{t.download.available}</p>
      <section className="download-web">
        <div>
          <p className="eyebrow">CONTINUE IN YOUR BROWSER</p>
          <h2>{t.download.webTitle}</h2>
          <p>{t.download.webBody}</p>
          <Button size="large" href={LINKS.web}>
            {t.common.web}
            <ArrowUpRight size={17} />
          </Button>
        </div>
        <ConnectionIllustration language={language} />
      </section>
      <section className="guide-callout">
        <div>
          <h2>{t.download.helpTitle}</h2>
          <p>{t.download.helpBody}</p>
        </div>
        <a className="text-link" href={href(language, 'guide/')}>
          {t.nav.guide}
          <ArrowRight size={18} />
        </a>
      </section>
      <p className="download-disclaimer">{t.download.note}</p>
    </div>
  );
}
