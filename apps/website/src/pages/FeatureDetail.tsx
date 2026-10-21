import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react';
import { copy } from '../content/copy';
import { featureContent, features } from '../content/features';
import type { Feature, Language } from '../content/types';
import { href, sourceUrl } from '../lib/site';
import { Actions, ClosingCta, Faq } from '../components/Shared';
import { FeatureIcon } from '../components/FeatureIcon';
import { ProductFigure } from '../components/ProductFigure';
import { FeatureCard } from '../components/FeatureCard';

function FeatureBody({ feature, language }: { feature: Feature; language: Language }) {
  const t = copy(language);
  const content = featureContent(feature, language);
  return (
    <div className="feature-editorial">
      <aside className="feature-toc">
        <p>{t.common.contents}</p>
        {content.sections.map((section, index) => (
          <a key={section.title} href={`#section-${index + 1}`}>
            <span>0{index + 1}</span>
            {section.title}
          </a>
        ))}
        <a href="#getting-started">
          <span>04</span>
          {t.common.steps}
        </a>
        <a className="text-link" href={sourceUrl(feature.source)}>
          {t.common.source}
          <ArrowUpRight size={15} />
        </a>
      </aside>
      <div className="feature-article">
        <div className="audience-note">
          <span>{t.common.audience}</span>
          <p>{content.audience}</p>
        </div>
        {content.sections.map((section, index) => (
          <section id={`section-${index + 1}`} key={section.title}>
            <p className="eyebrow">
              0{index + 1} / {content.title}
            </p>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            <ul className="check-list">
              {section.points.map((point) => (
                <li key={point}>
                  <Check size={17} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section id="getting-started">
          <h2>{t.common.steps}</h2>
          <ol className="getting-started-list">
            {content.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="usage-note">
            <strong>{t.common.note}</strong>
            <p>{content.note}</p>
          </div>
        </section>
        <Faq title={t.common.faq} items={content.faqs} />
      </div>
    </div>
  );
}

export function FeatureDetail({ feature, language }: { feature: Feature; language: Language }) {
  const t = copy(language);
  const content = featureContent(feature, language);
  const related = features.filter((item) => feature.related.includes(item.slug));
  return (
    <>
      <article className="shell">
        <header className="feature-heading">
          <a className="text-link back-link" href={href(language, 'features/')}>
            <ArrowLeft size={16} />
            {t.common.back}
          </a>
          <div className="feature-heading-grid">
            <div>
              <p className="feature-label">
                <FeatureIcon slug={feature.slug} />
                {content.title}
                <span>/{feature.number}</span>
              </p>
              <h1>{content.headline}</h1>
            </div>
            <div className="feature-heading-summary">
              <p>{content.summary}</p>
              <Actions language={language} />
            </div>
          </div>
        </header>
        <ProductFigure feature={feature} language={language} priority />
        <FeatureBody feature={feature} language={language} />
      </article>
      <section className="related-section shell">
        <p className="eyebrow">KEEP EXPLORING</p>
        <h2>{t.common.next}</h2>
        <div className="feature-grid">
          {related.map((item) => (
            <FeatureCard key={item.slug} feature={item} language={language} />
          ))}
        </div>
      </section>
      <ClosingCta language={language} />
    </>
  );
}
