import { ArrowUpRight } from 'lucide-react';
import { featureContent, featureImageAlt } from '../content/features';
import type { Feature, Language } from '../content/types';
import { href } from '../lib/site';
import { FeatureIcon } from './FeatureIcon';
import { ProductImage } from './ProductFigure';

export function FeatureCard({
  feature,
  language,
  visual = false,
}: {
  feature: Feature;
  language: Language;
  visual?: boolean;
}) {
  const content = featureContent(feature, language);
  return (
    <a
      className={`feature-card ${visual ? 'feature-card-visual' : ''}`}
      href={href(language, `features/${feature.slug}/`)}
    >
      <div className="feature-card-top">
        <span className="icon-tile">
          <FeatureIcon slug={feature.slug} />
        </span>
        <ArrowUpRight className="card-arrow" size={20} aria-hidden="true" />
      </div>
      <h3>{content.title}</h3>
      <p>{content.summary}</p>
      {visual && !feature.imageKind && (
        <div className="feature-card-image">
          <ProductImage name={feature.image} alt={featureImageAlt(feature, language)} />
        </div>
      )}
      <span className="card-number">/{feature.number}</span>
    </a>
  );
}
