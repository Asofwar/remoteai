import { Button } from 'antd';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import { copy } from '../content/copy';
import type { Language } from '../content/types';
import { href, LINKS } from '../lib/site';

export function Actions({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <div className="cta-actions">
      <Button type="primary" size="large" href={href(language, 'download/')}>
        {t.common.download}
        <ArrowUpRight size={18} aria-hidden="true" />
      </Button>
      <Button size="large" href={href(language, 'guide/')}>
        {t.nav.guide}
        <ArrowRight size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ClosingCta({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section className="closing-cta shell">
      <div className="closing-symbol" aria-hidden="true">
        ↗
      </div>
      <p className="eyebrow">LET’S MAKE SOMETHING.</p>
      <h2>{t.home.finalTitle}</h2>
      <p>{t.home.finalBody}</p>
      <Actions language={language} />
      <a className="text-link closing-source" href={LINKS.repository}>
        GitHub <ArrowUpRight size={15} />
      </a>
    </section>
  );
}

export function Faq({ items, title }: { items: { question: string; answer: string }[]; title: string }) {
  return (
    <section className="faq-section" aria-label={title}>
      <h2>{title}</h2>
      <div className="faq-list">
        {items.map((item) => (
          <details key={item.question}>
            <summary>
              {item.question}
              <Plus size={19} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
