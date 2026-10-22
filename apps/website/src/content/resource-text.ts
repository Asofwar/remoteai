import { withEnglishFallback } from './fallback';
import { resourceGroups, type AiResource, type ResourceGroup } from './resources';
import { ruResourceDescriptions, ruResourceGroups } from './resources-ru';
import type { Language } from './types';

if (import.meta.env.SSR) {
  const names = new Set(resourceGroups.flatMap((group) => group.items.map((resource) => resource.name)));
  for (const name of Object.keys(ruResourceDescriptions)) {
    if (!names.has(name)) console.warn(`[website] resources-ru.ts has a description for an unknown resource: ${name}`);
  }
}

/** Category title and description in the page language. Russian comes from resources-ru.ts. */
export function resourceGroupText(group: ResourceGroup, language: Language) {
  if (language !== 'ru') return { title: group.title[language], description: group.description[language] };
  return withEnglishFallback(
    ruResourceGroups[group.id],
    { title: group.title.en, description: group.description.en },
    `resources.${group.id}`,
  );
}

/** Resource description in the page language. Russian comes from resources-ru.ts. */
export function resourceDescription(resource: AiResource, language: Language) {
  if (language !== 'ru') return resource.description[language];
  return withEnglishFallback(
    ruResourceDescriptions[resource.name],
    resource.description.en,
    `resources.${resource.name}`,
  );
}
