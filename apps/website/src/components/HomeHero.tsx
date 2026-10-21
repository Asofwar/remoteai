import { ArrowDown, ArrowUpRight, Code2, Monitor, Sparkles } from 'lucide-react';
import { copy } from '../content/copy';
import type { Language } from '../content/types';
import { href } from '../lib/site';
import { ui } from '../lib/ui-text';
import { Actions } from './Shared';

export function HomeHero({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <section className="hero shell">
      <a className="hero-badge" href={href(language, 'features/codex-gui/')}>
        <Sparkles size={14} aria-hidden="true" />
        {t.home.badge}
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
      <h1>
        {t.home.title[0]}
        <br />
        <span>{t.home.title[1]}</span>
      </h1>
      <div className="hero-bottom">
        <div>
          <p className="hero-description">{t.home.description}</p>
          <Actions language={language} />
        </div>
        <div className="hero-facts" aria-label={ui(language, 'heroFacts')}>
          <div>
            <Monitor size={19} />
            <span>
              {t.home.platforms}
              <small>{ui(language, 'heroDesktop')}</small>
            </span>
          </div>
          <div>
            <Code2 size={19} />
            <span>
              Apache-2.0<small>{ui(language, 'heroOpenSource')}</small>
            </span>
          </div>
        </div>
      </div>
      <a className="hero-explore" href="#workspace">
        {t.home.explore}
        <ArrowDown size={15} aria-hidden="true" />
      </a>
    </section>
  );
}
