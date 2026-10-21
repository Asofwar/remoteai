import { useState } from 'react';
import { Button } from 'antd';
import { copy } from '../content/copy';
import { features } from '../content/features';
import type { Feature, Language } from '../content/types';
import { FeatureCard } from '../components/FeatureCard';
import { ClosingCta } from '../components/Shared';

type Category = Feature['category'] | 'all';
const categories: Category[] = ['all', 'build', 'connect', 'manage', 'personalize'];

export function Features({ language }: { language: Language }) {
  const t = copy(language);
  const [selected, setSelected] = useState<Category>('all');
  const visible = features.filter((feature) => selected === 'all' || feature.category === selected);
  return (
    <>
      <div className="shell">
        <header className="page-heading">
          <p className="eyebrow">{t.features.label}</p>
          <h1>{t.features.title}</h1>
          <p>{t.features.description}</p>
        </header>
        <div className="feature-filters" role="group" aria-label={t.nav.features}>
          {categories.map((category) => (
            <Button
              key={category}
              type={selected === category ? 'primary' : 'text'}
              aria-pressed={selected === category}
              onClick={() => setSelected(category)}
            >
              {t.features.categories[category]}
            </Button>
          ))}
        </div>
        <div className="feature-catalog" aria-live="polite">
          {visible.map((feature) => (
            <FeatureCard feature={feature} language={language} key={feature.slug} />
          ))}
        </div>
      </div>
      <ClosingCta language={language} />
    </>
  );
}
