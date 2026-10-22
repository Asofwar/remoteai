import type { Route } from '../App';
import { copy, homeFaqs } from '../content/copy';
import { featureContent, features, findFeature } from '../content/features';
import { pageMetadata } from './metadata';
import { resourceMarkdown } from './resource-content';
import { pagePath, SITE_URL, sourceUrl, LINKS } from './site';

function faqText(items: { question: string; answer: string }[]) {
  return items.map((item) => `### ${item.question}\n\n${item.answer}`).join('\n\n');
}

function featureText(route: Route) {
  const feature = findFeature(route.path.split('/')[1]);
  if (!feature) return '';
  const t = copy(route.language);
  const content = featureContent(feature, route.language);
  return [
    `## ${t.common.audience}\n\n${content.audience}`,
    ...content.sections.map(
      (section) =>
        `## ${section.title}\n\n${section.body}\n\n${section.points.map((point) => `- ${point}`).join('\n')}`,
    ),
    `## ${t.common.steps}\n\n${content.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
    `## ${t.common.note}\n\n${content.note}`,
    faqText(content.faqs),
    `[${t.common.source}](${sourceUrl(feature.source)})`,
  ].join('\n\n');
}

export function renderMarkdown(route: Route) {
  const { language, path } = route;
  const t = copy(language);
  const meta = pageMetadata(route);
  const url = new URL(pagePath(language, path), SITE_URL).href;
  const sections = [`# ${meta.title}`, `> ${meta.description}`, `Source: ${url}`];
  if (path.startsWith('features/') && path !== 'features/') sections.push(featureText(route));
  else if (path === 'resources/') sections.push(resourceMarkdown(language));
  else if (path === 'download/')
    sections.push(
      ...t.download.cards.map(
        (card) => `## ${card.name}\n\n${card.detail}\n\n${card.packages}\n\n[${t.download.latest}](${LINKS.latest})`,
      ),
      t.download.available,
      `## ${t.download.webTitle}\n\n${t.download.webBody}\n\n[RemoteAI Web](${LINKS.web})`,
      t.download.note,
    );
  else if (path === 'guide/')
    sections.push(
      ...t.guide.sections.map((section) => `## ${section.title}\n\n${section.body}`),
      ...t.guide.facts.map(([key, value]) => `- ${key}: ${value}`),
      faqText(homeFaqs[language]),
      `## ${t.guide.troubleshooting}\n\n${t.guide.troubleshootingBody}`,
    );
  else
    sections.push(
      ...features.map((feature) => {
        const content = featureContent(feature, language);
        return (
          `## ${content.title}\n\n${content.summary}\n\n` +
          `[${t.common.learn}](${new URL(pagePath(language, `features/${feature.slug}/`), SITE_URL).href})`
        );
      }),
      ...(path ? [] : [faqText(homeFaqs[language])]),
    );
  sections.push(`[GitHub](${LINKS.repository}) · [Apache-2.0](${LINKS.license})`);
  return `${sections.join('\n\n')}\n`;
}
