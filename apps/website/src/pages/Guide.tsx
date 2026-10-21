import { ArrowUpRight } from 'lucide-react';
import { copy, homeFaqs } from '../content/copy';
import type { Language } from '../content/types';
import { href, LINKS } from '../lib/site';
import { Faq } from '../components/Shared';

const stepPaths = ['download/', 'features/providers/', 'features/codex-gui/', 'features/remote-workspace/'];

export function Guide({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <article className="shell guide-page">
      <header className="page-heading">
        <p className="eyebrow">{t.guide.label}</p>
        <h1>{t.guide.title}</h1>
        <p>{t.guide.description}</p>
      </header>
      <div className="guide-steps">
        {t.guide.sections.map((section, index) => (
          <section key={section.title}>
            <span className="guide-step-index">0{index + 1}</span>
            <div>
              <h2>{section.title.slice(5)}</h2>
              <p>{section.body}</p>
              <a className="text-link" href={href(language, stepPaths[index])}>
                {index === 0 ? t.nav.download : t.common.learn}
                <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
        ))}
      </div>
      <section className="product-facts">
        <h2>{t.guide.factsTitle}</h2>
        <dl>
          {t.guide.facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <a className="text-link" href={LINKS.repository}>
          GitHub
          <ArrowUpRight size={16} />
        </a>
      </section>
      <Faq title={t.common.faq} items={homeFaqs[language]} />
      <section className="troubleshooting">
        <h2>{t.guide.troubleshooting}</h2>
        <p>{t.guide.troubleshootingBody}</p>
        <a className="text-link" href={LINKS.issues}>
          {t.footer.issues}
          <ArrowUpRight size={16} />
        </a>
      </section>
    </article>
  );
}
