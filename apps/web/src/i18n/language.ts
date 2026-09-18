import { useSyncExternalStore } from 'react';

export type Language = 'zh' | 'en';
export const LANGUAGE_KEY = 'codex-switch.web.language.v1';
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh'; }
  catch { return 'zh'; } // Language switching still works when browser storage is unavailable.
}

let language = readLanguage();
export const getLanguage = () => language;
export const getLocale = () => language === 'en' ? 'en-US' : 'zh-CN';

function publishLanguage(next: Language) {
  if (next === language) return;
  language = next;
  listeners.forEach(listener => listener());
}

export function setLanguage(next: Language) {
  if (next !== 'zh' && next !== 'en') return;
  try { localStorage.setItem(LANGUAGE_KEY, next); }
  catch { /* Keep the selected language for this visit if storage is unavailable. */ }
  publishLanguage(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_KEY || event.key === null) publishLanguage(readLanguage());
  });
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => 'zh' as const);
}
