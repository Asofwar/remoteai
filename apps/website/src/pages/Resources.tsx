import { ArrowRight, ArrowUpRight, Bookmark, BookOpen, Bot, Boxes, ChartNoAxesCombined, Code } from 'lucide-react';
import { resourceCount, resourceGroups, type AiResource, type ResourceGroup } from '../content/resources';
import { resourcesCopy } from '../content/resources-copy';
import { resourceDescription, resourceGroupText } from '../content/resource-text';
import type { Language } from '../content/types';
import { href } from '../lib/site';

const categoryIcons = { models: Bot, docs: Code, 'open-tools': Boxes, agents: BookOpen, learn: ChartNoAxesCombined };

function ResourceCard({ resource, language }: { resource: AiResource; language: Language }) {
  return (
    <li>
      <a className="resource-card" href={resource.url} target="_blank" rel="noopener noreferrer">
        <div className="resource-card-heading">
          <h3>{resource.name}</h3>
          <ArrowUpRight size={18} aria-hidden="true" />
        </div>
        <p>{resourceDescription(resource, language)}</p>
        <span className="resource-domain">{new URL(resource.url).hostname.replace(/^www\./, '')}</span>
        <span className="sr-only">{resourcesCopy(language).external}</span>
      </a>
    </li>
  );
}

function ResourceStat({ value, label, language }: { value: number; label: string; language: Language }) {
  // Russian puts the count after its label ("Разделов: 5"), so the noun never needs a plural form.
  if (language === 'ru') return <span>{label} <strong>{value}</strong></span>;
  return <span><strong>{value}</strong> {label}</span>;
}

function ResourceSection({ group, language }: { group: ResourceGroup; language: Language }) {
  const text = resourceGroupText(group, language);
  return (
    <section className="resource-section" id={group.id} aria-labelledby={`${group.id}-heading`}>
      <header>
        <h2 id={`${group.id}-heading`}>{text.title} <span>{group.items.length}</span></h2>
        <p>{text.description}</p>
      </header>
      <ul className="resource-grid">
        {group.items.map((resource) => <ResourceCard key={resource.url} resource={resource} language={language} />)}
      </ul>
    </section>
  );
}

function ResourceNavigation({ language }: { language: Language }) {
  return (
    <nav className="resource-nav" aria-label={resourcesCopy(language).navigation}>
      <p>{resourcesCopy(language).navigation}</p>
      {resourceGroups.map((group) => {
        const Icon = categoryIcons[group.id];
        return (
          <a key={group.id} href={`#${group.id}`}>
            <Icon size={17} aria-hidden="true" />
            <span>{resourceGroupText(group, language).title}</span>
            <span className="resource-nav-count">{group.items.length}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function Resources({ language }: { language: Language }) {
  const t = resourcesCopy(language);
  return (
    <article className="shell resources-page">
      <header className="page-heading resources-heading">
        <p className="eyebrow"><Bookmark size={15} aria-hidden="true" /> THE AI TOOLKIT</p>
        <h1>{t.heading}</h1>
        <p>{t.description}</p>
        <div className="resource-stats">
          <ResourceStat value={resourceCount} label={t.entries} language={language} />
          <ResourceStat value={resourceGroups.length} label={t.groups} language={language} />
        </div>
      </header>
      <div className="resource-layout">
        <ResourceNavigation language={language} />
        <div className="resource-sections">
          {resourceGroups.map((group) => <ResourceSection key={group.id} group={group} language={language} />)}
          <p className="resource-source-note">{t.sourceNote}</p>
          <section className="resource-next">
            <h2>{t.nextTitle}</h2>
            <p>{t.nextBody}</p>
            <div>
              <a className="text-link" href={href(language, 'features/providers/')}>
                {t.providers} <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="text-link" href={href(language, 'features/skills/')}>
                {t.skills} <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}
