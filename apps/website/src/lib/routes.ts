import { features } from '../content/features';
import type { Language } from '../content/types';
import { pagePath } from './site';

export const paths = [
  '', 'features/', 'download/', 'guide/', 'resources/', ...features.map((item) => `features/${item.slug}/`),
];
export const languages: Language[] = ['zh', 'en'];
export const routes = languages.flatMap((language) =>
  paths.map((path) => ({ language, path, outputPath: pagePath(language, path) })),
);
