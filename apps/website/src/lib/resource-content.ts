import type { Language } from '../content/types';
import { resourceGroups } from '../content/resources';
import { resourcesCopy } from '../content/resources-copy';
import { resourceDescription, resourceGroupText } from '../content/resource-text';
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
        description: resourceDescription(resource, language),
      },
    })),
  };
}

export function resourceMarkdown(language: Language) {
  return [
    ...resourceGroups.map((group) => {
      const text = resourceGroupText(group, language);
      return [
        `## ${text.title}`,
        text.description,
        ...group.items.map(
          (resource) => `- [${resource.name}](${resource.url}): ${resourceDescription(resource, language)}`,
        ),
      ].join('\n\n');
    }),
    resourcesCopy(language).sourceNote,
  ].join('\n\n');
}
