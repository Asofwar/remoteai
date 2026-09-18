import { messages } from './messages';
import { getLanguage } from './language';

export { getLanguage, getLocale, setLanguage, useLanguage } from './language';
export type { Language } from './language';
type Values = Record<string, string | number>;

/** Translate application copy only; conversation content and user data must stay verbatim. */
export function t(source: string, values: Values = {}): string {
  const template = getLanguage() === 'en' && Object.hasOwn(messages, source) ? messages[source] : source;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}
