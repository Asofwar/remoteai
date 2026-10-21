import type { Language } from '../content/types';

export const SITE_URL = __SITE_URL__;
export const BASE_PATH = new URL(SITE_URL).pathname;
export const LINKS = {
  repository: 'https://github.com/piperhex/remoteai',
  releases: 'https://github.com/piperhex/remoteai/releases',
  latest: 'https://github.com/piperhex/remoteai/releases/latest',
  web: 'https://codex.onepiper.cloud/web/',
  license: 'https://github.com/piperhex/remoteai/blob/master/LICENSE',
  issues: 'https://github.com/piperhex/remoteai/issues',
};

export function pagePath(language: Language, path = '') {
  return `${language === 'en' ? 'en/' : ''}${path}`;
}

export function href(language: Language, path = '') {
  return `${BASE_PATH}${pagePath(language, path)}`;
}

export function asset(name: string) {
  return `${BASE_PATH}media/${name}`;
}

export function sourceUrl(path: string) {
  return `${LINKS.repository}/blob/master/${path}`;
}

export function readRoute(pathname: string) {
  const path = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : '404/';
  const language: Language = path.startsWith('en/') || path === 'en' ? 'en' : 'zh';
  const relative = path
    .replace(/^en\/?/, '')
    .replace(/index\.html$/, '')
    .replace(/\/+$/, '');
  return { language, path: relative ? `${relative}/` : '' };
}
