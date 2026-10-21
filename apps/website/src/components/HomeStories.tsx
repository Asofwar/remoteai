import { ArrowUpRight, Check } from 'lucide-react';
import { features } from '../content/features';
import type { Language } from '../content/types';
import { href } from '../lib/site';
import { ProductImage } from './ProductFigure';

const stories = ['conversations', 'providers', 'skills'];
const storyFeatures = stories.flatMap((slug) => features.filter((feature) => feature.slug === slug));

export function HomeStories({ language }: { language: Language }) {
  return (
    <section className="home-stories shell" aria-label={language === 'zh' ? '完整工作流' : 'Your connected workflow'}>
      {storyFeatures.map((feature, index) => (
        <article className={`story-row story-${index + 1}`} key={feature.slug}>
          <div className="story-copy">
            <p className="eyebrow">
              <span>0{index + 1}</span>
              {feature[language].title}
            </p>
            <h2>{feature[language].headline}</h2>
            <p>{feature[language].summary}</p>
            <ul>
              {feature[language].sections.map((section) => (
                <li key={section.title}>
                  <Check size={16} aria-hidden="true" />
                  {section.title}
                </li>
              ))}
            </ul>
            <a className="text-link" href={href(language, `features/${feature.slug}/`)}>
              {language === 'zh' ? '深入了解' : 'Explore'} {feature[language].title}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <a className="story-visual" href={href(language, `features/${feature.slug}/`)}>
            <div className="story-visual-heading">
              <span>{feature[language].title}</span>
              <ArrowUpRight size={16} />
            </div>
            <ProductImage name={feature.image} alt={feature.imageAlt[language]} />
          </a>
        </article>
      ))}
    </section>
  );
}
