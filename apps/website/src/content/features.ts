import { workspaceFeatures } from './features-workspace';
import { managementFeatures } from './features-management';
import { toolFeatures } from './features-tools';
import { personalFeatures } from './features-personal';
import { ruFeatures } from './features-ru';
import { withEnglishFallback } from './fallback';
import type { Feature, FeatureContent, Language } from './types';

export const features = [...workspaceFeatures, ...managementFeatures, ...toolFeatures, ...personalFeatures];

export function findFeature(slug: string) {
  return features.find((feature) => feature.slug === slug);
}

if (import.meta.env.SSR) {
  for (const slug of Object.keys(ruFeatures)) {
    if (!findFeature(slug)) console.warn(`[website] features-ru.ts has text for an unknown feature: ${slug}`);
  }
}

const russianContent = new Map<string, FeatureContent>();

/** Feature text in the page language. Russian comes from features-ru.ts and falls back to English. */
export function featureContent(feature: Feature, language: Language): FeatureContent {
  if (language !== 'ru') return feature[language];
  let content = russianContent.get(feature.slug);
  if (!content) {
    content = withEnglishFallback(ruFeatures[feature.slug], feature.en, `features.${feature.slug}`);
    russianContent.set(feature.slug, content);
  }
  return content;
}

export function featureImageAlt(feature: Feature, language: Language) {
  if (language !== 'ru') return feature.imageAlt[language];
  return withEnglishFallback(
    ruFeatures[feature.slug]?.imageAlt,
    feature.imageAlt.en,
    `features.${feature.slug}.imageAlt`,
  );
}
