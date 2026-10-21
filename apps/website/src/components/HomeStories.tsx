import { ArrowUpRight, Check } from 'lucide-react';
import { featureContent, featureImageAlt, features } from '../content/features';
import type { Language } from '../content/types';
import { href } from '../lib/site';
import { ui } from '../lib/ui-text';
import { ProductImage } from './ProductFigure';

const stories = ['conversations', 'providers', 'skills'];
const storyFeatures = stories.flatMap((slug) => features.filter((feature) => feature.slug === slug));

export function HomeStories({ language }: { language: Language }) {
  return (
    <section className="home-stories shell" aria-label={ui(language, 'stories')}>
      {storyFeatures.map((feature, index) => {
        const content = featureContent(feature, language);
        return (
          <article className={`story-row story-${index + 1}`} key={feature.slug}>
            <div className="story-copy">
              <p className="eyebrow">
                <span>0{index + 1}</span>
                {content.title}
              </p>
              <h2>{content.headline}</h2>
              <p>{content.summary}</p>
              <ul>
                {content.sections.map((section) => (
                  <li key={section.title}>
                    <Check size={16} aria-hidden="true" />
                    {section.title}
                  </li>
                ))}
              </ul>
              <a className="text-link" href={href(language, `features/${feature.slug}/`)}>
                {ui(language, 'storyLink', { title: content.title })}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
            <a className="story-visual" href={href(language, `features/${feature.slug}/`)}>
              <div className="story-visual-heading">
                <span>{content.title}</span>
                <ArrowUpRight size={16} />
              </div>
              <ProductImage name={feature.image} alt={featureImageAlt(feature, language)} />
            </a>
          </article>
        );
      })}
    </section>
  );
}
