import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { execute } from '../apps/desktop/src-tauri/resources/chrome-extension/operations.js';
import { validate } from '../apps/desktop/src-tauri/resources/chrome-extension/validation.js';
import { initializePermissions } from '../apps/desktop/src-tauri/resources/chrome-extension/permissions.js';
import { acquireConnection, releaseConnection, hasDebuggerConnections, stopConnections }
  from '../apps/desktop/src-tauri/resources/chrome-extension/debugger-connections.js';
import { queueTarget } from '../apps/desktop/src-tauri/resources/chrome-extension/target-queue.js';

let tabs;
let groups;
let session;
let removed;
let detached;
const finish = (args, clientId = 'first') => execute({ clientId }, { operation: 'finish', args });
const attach = async tabId => releaseConnection(await acquireConnection({ tabId }, undefined, 'first'), true);

beforeEach(async () => {
  tabs = new Map([1, 2, 3, 4, 5].map(id => [id, { id, groupId: id === 5 ? 11 : 10 }]));
  groups = new Map([10, 11].map(id => [id, { id, windowId: 1, title: 'Remote AI' }]));
  session = {
    browserWorkTabs: [{ tabId: 2, clientId: 'first' }, { tabId: 3, clientId: 'first' },
      { tabId: 4, clientId: 'second' }, { tabId: 5, clientId: 'first' }],
    browserWorkGroups: [{ clientId: 'first', groupId: 10, windowId: 1 },
      { clientId: 'first', groupId: 11, windowId: 1 }],
  };
  removed = [];
  detached = [];
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ paused: false, siteAccessMode: 'all' }) },
      session: { get: async () => structuredClone(session),
        set: async value => Object.assign(session, structuredClone(value)) },
    },
    tabs: { query: async () => [...tabs.values()], remove: async id => {
      removed.push(id);
      const { groupId } = tabs.get(id);
      tabs.delete(id);
      if (![...tabs.values()].some(tab => tab.groupId === groupId)) groups.delete(groupId);
    } },
    tabGroups: { query: async () => [...groups.values()] },
    debugger: { attach: async () => {}, detach: async target => detached.push(target) },
  };
  await initializePermissions();
});
afterEach(async () => { await stopConnections(); delete globalThis.chrome; });

test('completion closes exact owned tabs, keeps user pages and other tasks, removes only empty groups', async () => {
  await attach(1);
  await attach(2);
  await attach(5);
  const result = await finish({ tabIds: [1, 2, 4, 5] });
  assert.deepEqual(result.closedTabIds, [2, 5]);
  assert.deepEqual(result.keptTabIds, [1, 4]);
  assert.deepEqual(result.failedTabIds, []);
  assert.deepEqual([...tabs.keys()], [1, 3, 4]);
  assert.deepEqual([...groups.keys()], [10]);
  assert.deepEqual(session.browserWorkTabs, [{ tabId: 3, clientId: 'first' }, { tabId: 4, clientId: 'second' }]);
  assert.deepEqual(session.browserWorkGroups, [{ clientId: 'first', groupId: 10, windowId: 1 }]);
  assert.equal(hasDebuggerConnections(), false);
});

test('requested keep tabs are released from ownership and cannot be closed by repeated completion', async () => {
  await attach(2);
  assert.deepEqual((await finish({ tabIds: [2], keepTabIds: [2] })).keptTabIds, [2]);
  assert.deepEqual(detached, [{ tabId: 2 }]);
  assert.deepEqual((await finish({ tabIds: [2] })).closedTabIds, []);
  assert.deepEqual(removed, []);
  assert.ok(tabs.has(2));
});

test('completion is repeatable for already closed tabs and honors saved ownership after worker restart', async () => {
  tabs.delete(2);
  assert.deepEqual((await finish({ tabIds: [2, 5] })).closedTabIds, [2, 5]);
  const restarted = await import('../apps/desktop/src-tauri/resources/chrome-extension/finish-task.js?restart');
  assert.deepEqual((await restarted.finishTask({ clientId: 'first' }, { tabIds: [3] })).closedTabIds, [3]);
  assert.deepEqual((await finish({ tabIds: [2, 3, 5] })).failedTabIds, []);
  assert.deepEqual(removed, [5, 3]);
});

test('cleanup failures retain ownership for retry and do not prevent other tabs from closing', async () => {
  const remove = chrome.tabs.remove;
  chrome.tabs.remove = async id => { if (id === 2) throw new Error('busy'); return remove(id); };
  const result = await finish({ tabIds: [2, 3] });
  assert.deepEqual(result.failedTabIds, [2]);
  assert.deepEqual(result.closedTabIds, [3]);
  assert.ok(session.browserWorkTabs.some(record => record.tabId === 2));
  chrome.tabs.remove = remove;
  assert.deepEqual((await finish({ tabIds: [2] })).closedTabIds, [2]);
});

test('completion waits for active target work instead of closing its tab mid-operation', async () => {
  let release;
  const work = queueTarget({ tabId: 2 }, () => new Promise(resolve => { release = resolve; }));
  const finishing = finish({ tabIds: [2] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(removed, []);
  release();
  await work;
  assert.deepEqual((await finishing).closedTabIds, [2]);
});

test('worker-only completion releases selected connections while preserving other targets', async () => {
  await releaseConnection(await acquireConnection({ targetId: 'worker' }, undefined, 'first'), true);
  await attach(2);
  assert.deepEqual((await finish({ tabIds: [], workerIds: ['worker'] })).releasedWorkerIds, ['worker']);
  assert.deepEqual(detached, [{ targetId: 'worker' }]);
  assert.equal(hasDebuggerConnections(), true);
});

test('a tab being used by another home remains open with its debugger connected', async () => {
  await attach(2);
  await releaseConnection(await acquireConnection({ tabId: 2 }, undefined, 'second'), true);
  assert.deepEqual((await finish({ tabIds: [2] })).keptTabIds, [2]);
  assert.equal(hasDebuggerConnections(), true);
  assert.deepEqual(removed, []);
});

test('completion never prompts for website access, including after navigation to an internal page', async () => {
  chrome.permissions = { contains: async () => assert.fail('cleanup must not request website access') };
  tabs.get(2).url = 'chrome://newtab/';
  assert.deepEqual((await finish({ tabIds: [2] })).closedTabIds, [2]);
});

test('completion validates bounded explicit target lists and keep subsets', () => {
  for (const args of [{}, { tabIds: null }, { tabIds: [-1] }, { tabIds: [1, 1] },
    { tabIds: [1], keepTabIds: [2] }, { tabIds: [], workerIds: [''] }, { tabIds: [], workerIds: ['a', 'a'] },
    { tabIds: Array.from({ length: 101 }, (_, id) => id) }]) {
    assert.throws(() => validate({ operation: 'finish', args }));
  }
  assert.equal(validate({ operation: 'finish', args: { tabIds: [1], keepTabIds: [1] } }).operation, 'finish');
});

test('cancellation during cleanup prevents tab closure and leaves ownership available for retry', async () => {
  const controller = new AbortController();
  chrome.tabs.query = async () => { controller.abort(); return [...tabs.values()]; };
  const result = await execute({ clientId: 'first', signal: controller.signal },
    { operation: 'finish', args: { tabIds: [2] } });
  assert.deepEqual(result.failedTabIds, [2]);
  assert.deepEqual(removed, []);
  assert.ok(session.browserWorkTabs.some(record => record.tabId === 2));
});
