import type { ReactNode } from 'react';
import { Button } from 'antd';
import { ArrowUpRight, Github, Languages, Menu } from 'lucide-react';
import { copy } from '../content/copy';
import { resourcesCopy } from '../content/resources-copy';
import type { Language } from '../content/types';
import { asset, href, languages, languageTags, LINKS } from '../lib/site';
import { languageLabels, languageNames, ui } from '../lib/ui-text';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  language: Language;
  path: string;
  children: ReactNode;
}

function Navigation({ language, path }: Omit<LayoutProps, 'children'>) {
  const t = copy(language);
  return (
    <>
      <a href={href(language, 'features/')} aria-current={path.startsWith('features/') ? 'page' : undefined}>
        {t.nav.features}
      </a>
      <a href={href(language, 'guide/')} aria-current={path === 'guide/' ? 'page' : undefined}>
        {t.nav.guide}
      </a>
      <a href={LINKS.repository} target="_blank" rel="noopener noreferrer">
        GitHub <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </>
  );
}

function Header({ language, path }: Omit<LayoutProps, 'children'>) {
  const t = copy(language);
  const target = path === '404/' ? '' : path;
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href={href(language)} aria-label="Remote AI">
          <img src={asset('logo.png')} width="36" height="36" alt="" />
          <span>
            Remote<span className="brand-ai"> AI</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label={ui(language, 'mainNavigation')}>
          <Navigation language={language} path={path} />
        </nav>
        <div className="header-actions">
          <ThemeToggle language={language} />
          <div className="language-switch" role="group" aria-label={ui(language, 'languageSwitch')}>
            <Languages size={17} aria-hidden="true" />
            {languages
              .filter((other) => other !== language)
              .map((other) => (
                <a
                  key={other}
                  className="language-link"
                  href={href(other, target)}
                  lang={languageTags[other]}
                  hrefLang={languageTags[other]}
                  title={languageNames[other] === languageLabels[other] ? undefined : languageNames[other]}
                >
                  {languageLabels[other]}
                </a>
              ))}
          </div>
          <Button className="header-download" type="primary" href={href(language, 'download/')}>
            {t.nav.download}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Button>
          <details className="mobile-menu">
            <summary aria-label={t.nav.menu}>
              <Menu size={22} aria-hidden="true" />
            </summary>
            <nav aria-label={ui(language, 'mobileNavigation')}>
              <Navigation language={language} path={path} />
              <a href={href(language, 'download/')}>{t.nav.download}</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function Footer({ language }: { language: Language }) {
  const t = copy(language);
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-main">
          <div>
            <a className="brand" href={href(language)}>
              <img src={asset('logo.png')} width="36" height="36" alt="" />
              Remote AI
            </a>
            <p>{t.footer.description}</p>
            <span className="open-source-mark">
              <span /> BUILT IN THE OPEN
            </span>
          </div>
          <div className="footer-column">
            <h2>{t.footer.product}</h2>
            <a href={href(language, 'features/')}>{t.nav.features}</a>
            <a href={href(language, 'download/')}>{t.nav.download}</a>
            <a href={LINKS.web}>{t.common.web}</a>
          </div>
          <div className="footer-column">
            <h2>{t.footer.resources}</h2>
            <a href={href(language, 'guide/')}>{t.nav.guide}</a>
            <a href={href(language, 'resources/')}>{resourcesCopy(language).title}</a>
            <a href={LINKS.releases}>{t.footer.releases}</a>
            <a href={href(language, 'index.md')}>{t.footer.text}</a>
          </div>
          <div className="footer-column">
            <h2>{t.footer.community}</h2>
            <a href={LINKS.repository}>
              <Github size={15} aria-hidden="true" /> GitHub
            </a>
            <a href={LINKS.issues}>{t.footer.issues}</a>
            <a href={LINKS.license}>{t.footer.license}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>Remote AI · Apache-2.0</span>
          <span>{t.footer.disclaimer}</span>
          <span>{t.footer.communityText}</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ language, path, children }: LayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        {copy(language).common.skip}
      </a>
      <Header language={language} path={path} />
      <main id="main">{children}</main>
      <Footer language={language} />
    </>
  );
}
