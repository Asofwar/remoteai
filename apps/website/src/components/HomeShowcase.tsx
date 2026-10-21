import { useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Check, Command, LockKeyhole } from 'lucide-react';
import { copy } from '../content/copy';
import { featureContent, featureImageAlt, features } from '../content/features';
import type { Language } from '../content/types';
import { href } from '../lib/site';
import { ui } from '../lib/ui-text';
import { ProductImage } from './ProductFigure';
import { FeatureIcon } from './FeatureIcon';

const showcaseSlugs = ['codex-gui', 'accounts', 'token-usage', 'themes'];
const showcaseFeatures = showcaseSlugs.flatMap((slug) => features.filter((feature) => feature.slug === slug));

function moveTab(event: KeyboardEvent<HTMLButtonElement>, select: (index: number) => void) {
  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
  const current = tabs.indexOf(event.currentTarget);
  const last = tabs.length - 1;
  const positions: Record<string, number> = {
    ArrowRight: (current + 1) % tabs.length,
    ArrowLeft: (current + last) % tabs.length,
    Home: 0,
    End: last,
  };
  const next = positions[event.key];
  if (next === undefined) return;
  event.preventDefault();
  select(next);
  tabs[next].focus();
}

export function HomeShowcase({ language }: { language: Language }) {
  const [selected, setSelected] = useState(0);
  const feature = showcaseFeatures[selected];
  const t = copy(language);
  return (
    <section id="workspace" className="workspace-section shell">
      <div className="showcase-tabs" role="tablist" aria-label={ui(language, 'showcaseTabs')}>
        {showcaseFeatures.map((item, index) => (
          <button
            key={item.slug}
            type="button"
            role="tab"
            id={`preview-${item.slug}`}
            aria-selected={index === selected}
            aria-controls="showcase-panel"
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => moveTab(event, setSelected)}
          >
            <FeatureIcon slug={item.slug} size={17} />
            {featureContent(item, language).title}
          </button>
        ))}
      </div>
      <div id="showcase-panel" role="tabpanel" aria-labelledby={`preview-${feature.slug}`} tabIndex={0}>
        <div className="workspace-stage">
          <div className="stage-heading">
            <span className="window-controls" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="stage-address">
              <LockKeyhole size={11} /> Remote AI / {featureContent(feature, language).title}
            </span>
            <Command size={15} aria-hidden="true" />
          </div>
          <div className="stage-image">
            <ProductImage name={feature.image} alt={featureImageAlt(feature, language)} priority />
          </div>
        </div>
        <div className="stage-footer">
          <span>{t.common.screenshot}</span>
          <a className="text-link" href={href(language, `features/${feature.slug}/`)}>
            {t.common.learn}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="value-strip">
        {t.home.pillars.map((text) => (
          <span key={text}>
            <Check size={15} aria-hidden="true" />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}
