import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { updatePageIcon, markControlledTab, clearControlledTabs }
  from '../apps/desktop/src-tauri/resources/chrome-extension/tab-indicator.js';

let dom;
afterEach(() => {
  globalThis.__codexSwitchTabIcon?.restore();
  dom?.window.close();
  delete globalThis.document;
  delete globalThis.MutationObserver;
  delete globalThis.chrome;
});

test('controlled tabs use a green cursor and restore the original website icon', async () => {
  dom = new JSDOM('<head><link rel="icon" href="/original.ico"><title>Website</title></head>');
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  const original = document.querySelector('link');
  let stored = {};
  globalThis.chrome = {
    storage: { session: { get: async () => stored, set: async value => { stored = value; } } },
    scripting: { executeScript: async ({ func, args }) => func(...args) },
  };
  await markControlledTab(7);
  const icon = document.querySelector('link[rel="icon"]');
  assert.match(decodeURIComponent(icon.href), /stroke="#16a34a"/);
  assert.equal(document.title, 'Website');
  assert.deepEqual(stored.controlledTabs, [7]);
  await markControlledTab(7);
  assert.deepEqual(stored.controlledTabs, [7]);
  await clearControlledTabs();
  assert.equal(document.querySelector('link'), original);
  assert.equal(original.getAttribute('href'), '/original.ico');
  assert.deepEqual(stored.controlledTabs, []);
});

test('website icon updates cannot remove the control indicator and are restored afterwards', async () => {
  dom = new JSDOM('<head></head>');
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  updatePageIcon('data:image/svg+xml,green-cursor');
  const replacement = document.createElement('link');
  replacement.rel = 'icon';
  replacement.href = '/updated.ico';
  document.head.append(replacement);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelectorAll('link[rel="icon"]').length, 1);
  assert.match(document.querySelector('link').href, /green-cursor/);
  updatePageIcon(null);
  assert.equal(document.querySelector('link'), replacement);
});

test('closing a tab cleans only its state even if its document is no longer accessible', async () => {
  let stored = { controlledTabs: [7, 8] };
  globalThis.chrome = {
    storage: { session: { get: async () => stored, set: async value => { stored = value; } } },
    scripting: { executeScript: async () => { throw new Error('tab closed'); } },
  };
  await clearControlledTabs(7);
  assert.deepEqual(stored.controlledTabs, [8]);
});
