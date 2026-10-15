import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { stopDebugging } from '../apps/desktop/src-tauri/resources/chrome-extension/driver.js';
import { hasDebuggerConnections } from '../apps/desktop/src-tauri/resources/chrome-extension/debugger-connections.js';

const event = () => {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => listeners.forEach(fn => fn(...args)) };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
let port;
let replies;
let calls;
let sequence;
let local;

async function request(tabId = 1, clientId = 'a'.repeat(64), sessionId) {
  const id = String(++sequence);
  port.onMessage.emit({ id, clientId, sessionId, request: { operation: 'screenshot', args: { tabId } } });
  for (let attempt = 0; attempt < 100; attempt++) {
    const reply = replies.find(item => item.id === id);
    if (reply) return reply;
    await flush();
  }
  throw new Error('No extension reply');
}

function popup(message) {
  return new Promise(resolve => chrome.runtime.onMessage.emit(message,
    { id: 'fixture', url: 'chrome-extension://fixture/popup.html' }, resolve));
}

beforeEach(async () => {
  replies = [];
  calls = [];
  sequence = 0;
  local = { paused: false, siteAccessMode: 'all' };
  let session = {};
  port = { onMessage: event(), onDisconnect: event(), postMessage: value => replies.push(value) };
  globalThis.chrome = {
    storage: {
      local: { get: async () => local, set: async value => Object.assign(local, value) },
      session: { get: async () => session, set: async value => { Object.assign(session, value); } },
    },
    permissions: { contains: async () => true, onRemoved: event() },
    runtime: { id: 'fixture', getURL: name => `chrome-extension://fixture/${name}`,
      connectNative: () => port, onMessage: event(), onInstalled: event(), onStartup: event() },
    alarms: { create: () => {}, onAlarm: event() },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    sidePanel: { setPanelBehavior: async options => { globalThis.panelBehavior = options; } },
    tabs: { get: async id => ({ id, url: 'https://fixture.example/' }), onUpdated: event(), onRemoved: event() },
    tabGroups: { query: async () => [] },
    windows: { onRemoved: event() },
    scripting: { executeScript: async () => {} },
    debugger: { onEvent: event(), onDetach: event(),
      attach: async target => calls.push(['attach', target]), detach: async target => calls.push(['detach', target]),
      sendCommand: async (_target, method) => method === 'Page.getLayoutMetrics'
        ? { cssLayoutViewport: { clientWidth: 1280, clientHeight: 720 } } : { data: 'fixture' },
    },
  };
  await import(`../apps/desktop/src-tauri/resources/chrome-extension/background.js?test=${crypto.randomUUID()}`);
  await flush();
});
afterEach(() => stopDebugging());

test('one MCP session ending releases only its ownership even within the same home', async () => {
  const clientId = 'a'.repeat(64), first = crypto.randomUUID(), second = crypto.randomUUID();
  await request(1, clientId, first); await request(2, clientId, first); await request(2, clientId, second);
  port.onMessage.emit({ type: 'client-disconnected', clientId, sessionId: first });
  await flush();
  assert.deepEqual(calls.filter(([method]) => method === 'detach'), [['detach', { tabId: 1 }]]);
  assert.equal((await request(2, clientId, second)).error, null);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 2);
  port.onMessage.emit({ type: 'client-disconnected', clientId, sessionId: second });
  await flush();
  assert.equal(hasDebuggerConnections(), false);
});

test('client exit releases its tabs and workers but preserves another live client on a shared tab', async () => {
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  await request(1, first); await request(2, first); await request(2, second);
  port.onMessage.emit({ type: 'client-disconnected', clientId: first });
  await flush();
  assert.deepEqual(calls.filter(([method]) => method === 'detach'), [['detach', { tabId: 1 }]]);
  assert.equal((await request(2, second)).error, null);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 2);
  port.onMessage.emit({ type: 'client-disconnected', clientId: second });
  await flush();
  assert.equal(hasDebuggerConnections(), false);
});

test('client exit aborts active and queued work without detaching another client', async () => {
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  await request(1, second);
  let finish;
  const held = new Promise(resolve => { finish = resolve; });
  const original = chrome.debugger.sendCommand;
  chrome.debugger.sendCommand = async (target, method) => {
    if (method === 'Page.captureScreenshot') await held;
    return original(target, method);
  };
  const active = request(1, first), queued = request(1, first);
  await flush();
  port.onMessage.emit({ type: 'client-disconnected', clientId: first });
  finish();
  assert.match((await active).error, /取消/);
  assert.match((await queued).error, /取消/);
  assert.equal(calls.filter(([method]) => method === 'detach').length, 0);
  assert.equal((await request(1, second)).error, null);
});

test('the toolbar icon opens a native side panel', () => {
  assert.deepEqual(globalThis.panelBehavior, { openPanelOnActionClick: true });
});

test('remote chat frames and page scripts cannot change browser permissions', async () => {
  for (const sender of [
    { id: 'fixture', url: 'https://codex.onepiper.cloud/web/' },
    { id: 'fixture', url: 'https://example.com/popup.html' },
    { id: 'other', url: 'chrome-extension://fixture/popup.html' },
  ]) {
    let responded = false;
    chrome.runtime.onMessage.emit({ operation: 'pause', paused: true }, sender, () => { responded = true; });
    await flush();
    assert.equal(local.paused, false);
    assert.equal(responded, false);
  }
});

test('successive native requests keep the banner connection until the popup pauses control', async () => {
  assert.equal((await request()).error, null);
  assert.equal((await request()).error, null);
  assert.deepEqual(calls, [['attach', { tabId: 1 }]]);
  await popup({ operation: 'pause', paused: true });
  assert.equal(hasDebuggerConnections(), false);
  assert.match((await request()).error, /暂停/);
  await popup({ operation: 'pause', paused: false });
  assert.equal((await request()).error, null);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 2);
});

test('Chrome Cancel pauses all work and never reconnects until the user resumes', async () => {
  await request(1);
  await request(2);
  chrome.debugger.onDetach.emit({ tabId: 1 }, 'canceled_by_user');
  await flush();
  assert.equal(local.paused, true);
  assert.equal(hasDebuggerConnections(), false);
  assert.match((await request(2)).error, /暂停/);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 2);
});

test('closing one tab releases its bookkeeping without pausing another tab', async () => {
  await request(1);
  await request(2);
  chrome.debugger.onDetach.emit({ tabId: 1 }, 'target_closed');
  chrome.tabs.onRemoved.emit(1);
  await flush();
  assert.equal(local.paused, false);
  assert.equal((await request(2)).error, null);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 2);
});

test('Chrome Cancel stops active and queued operations without reattaching', async () => {
  let finish;
  const held = new Promise(resolve => { finish = resolve; });
  const original = chrome.debugger.sendCommand;
  chrome.debugger.sendCommand = async (target, method) => {
    if (method === 'Page.captureScreenshot') await held;
    return original(target, method);
  };
  const active = request();
  const queued = request();
  await flush();
  chrome.debugger.onDetach.emit({ tabId: 1 }, 'canceled_by_user');
  finish();
  assert.match((await active).error, /暂停|取消/);
  assert.match((await queued).error, /暂停|取消/);
  assert.equal(calls.filter(([method]) => method === 'attach').length, 1);
  assert.equal(hasDebuggerConnections(), false);
});

for (const operation of ['revoke', 'siteAccess', 'disconnect', 'permissionRemoved']) {
  test(`${operation} releases idle connections between native requests`, async () => {
    await request();
    if (operation === 'disconnect') port.onDisconnect.emit();
    else if (operation === 'permissionRemoved') chrome.permissions.onRemoved.emit({ origins: ['https://*/*'] });
    else await popup({ operation, origin: 'https://fixture.example', allowAll: false });
    await flush();
    assert.equal(hasDebuggerConnections(), false);
    assert.equal(calls.at(-1)[0], 'detach');
  });
}
