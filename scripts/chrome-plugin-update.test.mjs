import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createBundleUpdater, UPDATE_ALARM } from '../apps/desktop/src-tauri/resources/chrome-extension/auto-update.js';
import { bundleRevision } from '../apps/desktop/src-tauri/resources/chrome-extension/bundle-version.js';

const originalFetch = globalThis.fetch;
let busy;
let cleaned;
let reloaded;
let requests;
let marker;
let alarms;
let updater;
beforeEach(() => {
  busy = false;
  cleaned = 0;
  reloaded = 0;
  requests = 0;
  alarms = [];
  marker = { revision: 'a'.repeat(64) };
  globalThis.chrome = {
    runtime: { id: 'hgdkdomojacbaehnmlahndjmhglbjjim', getURL: name => `chrome-extension://test/${name}`,
      reload: () => { assert.equal(cleaned, 1); reloaded++; } },
    alarms: { create: (...args) => alarms.push(args) },
  };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    requests++;
    return { ok: true, json: async () => marker };
  };
  updater = createBundleUpdater({ busy: () => busy, beforeReload: async () => { cleaned++; } });
});
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.chrome; });

test('a changed completed bundle reloads once after cleanup', async () => {
  await Promise.all([updater.check(), updater.check()]);
  await updater.check();
  assert.equal(requests, 1);
  assert.equal(reloaded, 1);
  assert.equal(updater.isReloading(), true);
});

test('busy browser operations postpone reload, including operations begun during the check', async () => {
  busy = true;
  await updater.check();
  assert.equal(requests, 0);
  busy = false;
  const fetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { busy = true; return fetch(...args); };
  await updater.check();
  assert.equal(reloaded, 0);
  busy = false;
  globalThis.fetch = fetch;
  await updater.check();
  assert.equal(reloaded, 1);
});

test('unchanged, invalid, and missing markers never reload and failures can retry', async () => {
  for (const revision of [bundleRevision, '', null, 'invalid']) {
    marker = { revision };
    await updater.check();
  }
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  await updater.check();
  globalThis.fetch = async () => { throw new Error('export in progress'); };
  await updater.check();
  assert.equal(reloaded, 0);
  globalThis.fetch = fetch;
  marker = { revision: 'b'.repeat(64) };
  await updater.check();
  assert.equal(reloaded, 1);
});

test('store editions neither poll unpacked files nor reload from desktop changes', async () => {
  chrome.runtime.id = 'ocngjhjonejkndmlkjmbgjdlghkdhpjj';
  updater.start();
  await updater.check();
  assert.equal(requests, 0);
  assert.deepEqual(alarms, []);
  assert.equal(reloaded, 0);
});

test('unpacked editions check on startup and schedule periodic checks', async () => {
  updater.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(alarms, [[UPDATE_ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 }]]);
  assert.equal(reloaded, 1);
});
