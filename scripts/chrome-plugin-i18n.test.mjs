import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { localizeDocument, t } from '../apps/desktop/src-tauri/resources/chrome-extension/i18n.js';
import { validate } from '../apps/desktop/src-tauri/resources/chrome-extension/validation.js';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const LOCALES = ['zh_CN', 'en', 'ru'];
const HAN = /\p{Script=Han}/u;
const PAGES = ['popup.html', 'sidepanel.html', 'approval.html'];
const CALL = /\bt\('([^']+)', '([^']*)'\)/g;
const read = (name) => fs.readFile(path.join(source, name), 'utf8');
const messages = Object.fromEntries(await Promise.all(LOCALES.map(async (locale) =>
  [locale, JSON.parse(await read(`_locales/${locale}/messages.json`))])));
const manifest = JSON.parse(await read('manifest.json'));
const scripts = (await fs.readdir(source)).filter((name) => name.endsWith('.js'));

function useLocale(locale) {
  globalThis.chrome = { i18n: { getMessage: (name) => messages[locale]?.[name]?.message ?? '' } };
}

afterEach(() => { delete globalThis.chrome; });

test('the manifest is localized and keeps the published Chinese name and description', () => {
  assert.equal(manifest.default_locale, 'zh_CN');
  assert.equal(manifest.name, '__MSG_extensionName__');
  assert.equal(manifest.description, '__MSG_extensionDescription__');
  assert.equal(manifest.action.default_title, '__MSG_extensionName__');
  assert.equal(messages.zh_CN.extensionName.message, 'Remote AI 浏览器助手');
  assert.equal(messages.zh_CN.extensionDescription.message, '让 Remote AI 帮你浏览网页、查找信息和操作网站。你可以随时暂停。');
  for (const locale of LOCALES) {
    // Chrome Web Store limits for the extension name and description.
    assert.ok([...messages[locale].extensionName.message].length <= 75, locale);
    assert.ok([...messages[locale].extensionDescription.message].length <= 132, locale);
  }
});

test('every locale defines the same valid messages without untranslated text', () => {
  const names = Object.keys(messages.zh_CN);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(messages[locale]), names, locale);
    for (const [name, entry] of Object.entries(messages[locale])) {
      assert.match(name, /^[A-Za-z0-9_]+$/);
      assert.deepEqual(Object.keys(entry), ['message'], `${locale}.${name}`);
      assert.ok(entry.message.trim(), `${locale}.${name}`);
      // `$` starts a chrome.i18n placeholder; none of these messages uses substitutions.
      assert.ok(!entry.message.includes('$'), `${locale}.${name}`);
      if (locale !== 'zh_CN') assert.ok(!HAN.test(entry.message), `${locale}.${name}: ${entry.message}`);
    }
  }
  for (const [name, { message }] of Object.entries(messages.ru)) {
    assert.ok(!/пожалуйста|\.\.\.|"/i.test(message), `ru.${name}: ${message}`);
  }
});

test('script fallbacks match the Chinese messages and no Chinese text bypasses chrome.i18n', async () => {
  for (const name of scripts) {
    const code = await read(name);
    for (const [, key, fallback] of code.matchAll(CALL)) {
      assert.equal(messages.zh_CN[key]?.message, fallback, `${name}: ${key}`);
    }
    const rest = code.replace(CALL, '').replace(/\/\/.*$/gm, '');
    assert.ok(!HAN.test(rest), `${name} has Chinese text outside t()`);
  }
});

test('page defaults match the Chinese messages and every Chinese text is marked for translation', async () => {
  for (const page of PAGES) {
    const { document } = new JSDOM(await read(page)).window;
    for (const element of document.querySelectorAll('[data-i18n]')) {
      assert.equal(element.textContent, messages.zh_CN[element.dataset.i18n]?.message, `${page}: ${element.dataset.i18n}`);
      element.textContent = '';
    }
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        assert.equal(element.getAttribute(attribute), messages.zh_CN[key]?.message, `${page}: ${key}`);
        element.removeAttribute(attribute);
      }
    }
    assert.ok(!HAN.test(document.documentElement.outerHTML), `${page} has Chinese text without data-i18n`);
  }
});

test('every message is used by the manifest, a page or a script', async () => {
  const used = new Set(['htmlLang', 'extensionName', 'extensionDescription']);
  for (const name of scripts) for (const [, key] of (await read(name)).matchAll(CALL)) used.add(key);
  for (const page of PAGES) {
    for (const [, key] of (await read(page)).matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(key);
  }
  assert.deepEqual(Object.keys(messages.zh_CN).filter((name) => !used.has(name)), []);
  assert.deepEqual([...used].filter((name) => !messages.zh_CN[name]), []);
});

test('pages switch text, attributes and language to the Chrome UI locale', async () => {
  for (const locale of ['en', 'ru']) {
    useLocale(locale);
    const { document } = new JSDOM(await read('sidepanel.html')).window;
    localizeDocument(document);
    assert.equal(document.documentElement.lang, locale);
    assert.equal(document.querySelector('#loading').textContent, messages[locale].chatOpening.message);
    assert.equal(document.querySelector('#reload').getAttribute('aria-label'), messages[locale].reloadChat.message);
    assert.equal(document.querySelector('#settings').title, messages[locale].settingsTitle.message);
    assert.ok(!HAN.test(document.documentElement.outerHTML), locale);
    const popup = new JSDOM(await read('popup.html')).window.document;
    localizeDocument(popup);
    assert.equal(popup.querySelector('#name').placeholder, messages[locale].browserNamePlaceholder.message);
    assert.ok(!HAN.test(popup.documentElement.outerHTML), locale);
  }
});

test('without chrome.i18n or a matching message the Chinese source is kept', async () => {
  const original = await read('approval.html');
  const { document } = new JSDOM(original).window;
  localizeDocument(document);
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(document.querySelector('h1').textContent, '允许访问这个网站？');
  globalThis.chrome = { i18n: { getMessage: () => '' } };
  assert.equal(t('missing', '浏览器操作已取消。'), '浏览器操作已取消。');
});

test('tool validation errors follow the Chrome UI locale', () => {
  const invalidTab = () => validate({ operation: 'click', args: { tabId: -1, x: 1, y: 1 } });
  assert.throws(invalidTab, { message: '请先选择浏览器标签页。' });
  useLocale('en');
  assert.throws(invalidTab, { message: 'Select a browser tab first.' });
  useLocale('ru');
  assert.throws(invalidTab, { message: 'Сначала выберите вкладку браузера.' });
  useLocale('zh_CN');
  assert.throws(invalidTab, { message: '请先选择浏览器标签页。' });
});
