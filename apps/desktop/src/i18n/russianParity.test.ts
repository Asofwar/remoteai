import { expect, it } from 'vitest';
import { english } from '../../../../shared/i18n/en';
import { russian } from '../../../../shared/i18n/ru';

const chinese = /[一-鿿]/;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const russianCopy: Readonly<Record<string, string>> = russian;

it('gives every shared English string a Russian translation', () => {
  const missing = Object.keys(english).filter(source => !Object.hasOwn(russianCopy, source));
  expect(missing).toEqual([]);
});

it('keeps the placeholders of every shared English string in Russian, without Chinese text', () => {
  for (const source of Object.keys(english)) {
    const value = russianCopy[source] ?? '';
    expect(placeholders(value), source).toEqual(placeholders(source));
    expect(value, source).not.toMatch(chinese);
  }
});
