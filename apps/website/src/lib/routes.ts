import { features } from '../content/features';
import { languages, pagePath } from './site';

export const paths = [
  '', 'features/', 'download/', 'guide/', 'resources/', ...features.map((item) => `features/${item.slug}/`),
];
export { languages };
export const routes = languages.flatMap((language) =>
  paths.map((path) => ({ language, path, outputPath: pagePath(language, path) })),
);
