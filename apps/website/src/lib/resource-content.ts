import type { Language } from '../content/types';
import { resourceGroups } from '../content/resources';
import { resourcesCopy } from '../content/resources-copy';
import { pagePath, SITE_URL } from './site';

export function resourceListSchema(language: Language) {
  const items = resourceGroups.flatMap((group) => group.items);
  return {
    '@type': 'ItemList',
    '@id': `${new URL(pagePath(language, 'resources/'), SITE_URL).href}#resources`,
    name: resourcesCopy(language).title,
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListUnordered',
    itemListElement: items.map((resource, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'WebSite',
        name: resource.name,
        url: resource.url,
        description: resource.description[language],
      },
    })),
  };
}

export function resourceMarkdown(language: Language) {
  return [
    ...resourceGroups.map((group) => [
      `## ${group.title[language]}`,
      group.description[language],
      ...group.items.map((resource) => `- [${resource.name}](${resource.url}): ${resource.description[language]}`),
    ].join('\n\n')),
    resourcesCopy(language).sourceNote,
  ].join('\n\n');
}
