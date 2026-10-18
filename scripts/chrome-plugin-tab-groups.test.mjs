import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { execute } from '../apps/desktop/src-tauri/resources/chrome-extension/operations.js';
import { renameWorkGroups, withNewTabs, workTabOwner }
  from '../apps/desktop/src-tauri/resources/chrome-extension/tab-groups.js';

let state;
let navigationListeners;
const USER_TAB_ID = 1;
const USER_GROUP_ID = 10;
const PAGE_URL = 'https://example.com/';
const open = (clientId = 'first', args = {}) => execute({ clientId },
  { operation: 'open', args: { url: PAGE_URL, ...args } });

function tabApi() {
  return {
    create: async (options) => {
      const tab = { id: state.nextTab++, windowId: state.windowId, groupId: -1, ...options };
      state.tabs.set(tab.id, tab);
      return { ...tab };
    },
    get: async (id) => ({ ...state.tabs.get(id) }),
    query: async () => [...state.tabs.values()],
    update: async (id, options) => {
      state.updates.push({ id, ...options });
      Object.assign(state.tabs.get(id), options);
    },
    group: async ({ tabIds, groupId, createProperties }) => {
      if (groupId === undefined) {
        groupId = state.nextGroup++;
        state.groups.set(groupId, { id: groupId, windowId: createProperties.windowId });
      }
      for (const id of tabIds) state.tabs.get(id).groupId = groupId;
      return groupId;
    },
    remove: async (id) => {
      const { groupId } = state.tabs.get(id);
      state.tabs.delete(id);
      if (![...state.tabs.values()].some((tab) => tab.groupId === groupId)) state.groups.delete(groupId);
    },
  };
}

beforeEach(() => {
  navigationListeners = new Set();
  state = { session: {}, windowId: 2, nextTab: 20, nextGroup: 100, updates: [],
    tabs: new Map([[USER_TAB_ID, { id: USER_TAB_ID, windowId: 2, groupId: USER_GROUP_ID,
      active: true, url: PAGE_URL }]]),
    groups: new Map([[USER_GROUP_ID, { id: USER_GROUP_ID, windowId: 2, title: 'Remote AI', color: 'blue' }]]) };
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ siteAccessMode: 'all' }) },
      session: { get: async () => structuredClone(state.session),
        set: async (value) => Object.assign(state.session, structuredClone(value)) },
    },
    permissions: { contains: async () => true },
    webNavigation: { onCreatedNavigationTarget: {
      addListener: listener => navigationListeners.add(listener),
      removeListener: listener => navigationListeners.delete(listener),
    } },
    windows: { get: async () => ({ type: 'normal' }) },
    tabs: tabApi(),
    tabGroups: { query: async () => [...state.groups.values()],
      update: async (id, properties) => Object.assign(state.groups.get(id), properties) },
  };
});

afterEach(() => { delete globalThis.chrome; });

test('default opens use a new background group and preserve the active page and same-named user group', async () => {
  const originalTab = { ...state.tabs.get(USER_TAB_ID) };
  const originalGroup = { ...state.groups.get(USER_GROUP_ID) };
  const result = await open();
  assert.notEqual(result.groupId, USER_GROUP_ID);
  assert.equal(state.tabs.get(result.tabId).active, false);
  assert.equal(state.tabs.get(result.tabId).groupId, result.groupId);
  assert.deepEqual(state.groups.get(result.groupId),
    { id: result.groupId, windowId: 2, title: 'Remote AI', color: 'green' });
  assert.deepEqual(state.tabs.get(USER_TAB_ID), originalTab);
  assert.deepEqual(state.groups.get(USER_GROUP_ID), originalGroup);
  assert.deepEqual(state.updates, []);
  const listed = await execute({ clientId: 'first' }, { operation: 'tabs' });
  assert.equal(listed.tabs.find((tab) => tab.tabId === result.tabId).groupId, result.groupId);
});

test('concurrent opens from one home reuse their group without creating duplicates', async () => {
  const results = await Promise.all([open(), open(), open()]);
  assert.equal(new Set(results.map((result) => result.groupId)).size, 1);
  assert.equal(state.groups.size, 2);
  assert.equal(state.session.browserWorkGroups.length, 1);
});

test('upgrade renames only recorded legacy groups and preserves user names and pages', async () => {
  const first = await open();
  const customized = await open('second');
  state.groups.get(first.groupId).title = 'Codex';
  state.groups.get(customized.groupId).title = 'My task';
  state.groups.get(USER_GROUP_ID).title = 'Codex';
  await renameWorkGroups();
  assert.equal(state.groups.get(first.groupId).title, 'Remote AI');
  assert.equal(state.groups.get(customized.groupId).title, 'My task');
  assert.equal(state.groups.get(USER_GROUP_ID).title, 'Codex');
  assert.equal(state.tabs.size, 3);
});

test('different homes and windows receive separate groups', async () => {
  const first = await open();
  const second = await open('second');
  state.windowId = 3;
  const anotherWindow = await open();
  assert.equal(new Set([first.groupId, second.groupId, anotherWindow.groupId]).size, 3);
  assert.equal(anotherWindow.windowId, 3);
  state.windowId = 2;
  assert.equal((await open()).groupId, first.groupId);
});

test('session records survive worker restart and closed groups are replaced', async () => {
  const first = await open();
  const restarted = await import('../apps/desktop/src-tauri/resources/chrome-extension/tab-groups.js?restarted');
  const tab = await chrome.tabs.create({ url: PAGE_URL, active: false });
  assert.equal(await restarted.groupNewTab('first', tab), first.groupId);
  await chrome.tabs.remove(first.tabId);
  await chrome.tabs.remove(tab.id);
  const replacement = await open();
  assert.notEqual(replacement.groupId, first.groupId);
  assert.deepEqual(state.session.browserWorkGroups,
    [{ clientId: 'first', windowId: 2, groupId: replacement.groupId }]);
});

test('moving a group to another window does not move new tabs out of their window', async () => {
  const first = await open();
  state.groups.get(first.groupId).windowId = 3;
  state.tabs.get(first.tabId).windowId = 3;
  const next = await open();
  assert.notEqual(next.groupId, first.groupId);
  assert.equal(next.windowId, 2);
  assert.equal(state.tabs.get(first.tabId).windowId, 3);
});

test('explicit foreground opens activate the new tab only after it is grouped', async () => {
  chrome.tabs.update = async (id, options) => {
    assert.equal(state.groups.get(state.tabs.get(id).groupId).title, 'Remote AI');
    state.updates.push({ id, ...options });
  };
  const result = await open('first', { background: false });
  assert.deepEqual(state.updates, [{ id: result.tabId, active: true }]);
});

test('grouping failures remove only the new tab, report an error and allow retry', async () => {
  const group = chrome.tabs.group;
  chrome.tabs.group = async () => { throw new Error('internal grouping failure'); };
  await assert.rejects(open(), /未能打开分组标签页/);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
  assert.deepEqual(state.updates, []);
  chrome.tabs.group = group;
  assert.equal(state.groups.get((await open()).groupId).title, 'Remote AI');
});

test('group setup and storage failures also remove the new tab', async () => {
  chrome.tabGroups.update = async () => { throw new Error('update failed'); };
  await assert.rejects(open(), /未能打开分组标签页/);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
  chrome.tabGroups.update = async (id, properties) => Object.assign(state.groups.get(id), properties);
  chrome.storage.session.set = async () => { throw new Error('storage failed'); };
  await assert.rejects(open(), /未能打开分组标签页/);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
  assert.deepEqual([...state.groups.keys()], [USER_GROUP_ID]);
});

test('cleanup failures tell the user to check the new tab without closing other tabs', async () => {
  chrome.tabs.group = async () => { throw new Error('group failed'); };
  chrome.tabs.remove = async () => { throw new Error('remove failed'); };
  await assert.rejects(open(), /请检查新打开的标签页/);
  assert.equal(state.tabs.get(USER_TAB_ID).active, true);
});

test('cancellation during grouping cleans up the new tab without activating it', async () => {
  const controller = new AbortController();
  chrome.tabGroups.update = async () => { controller.abort(); };
  await assert.rejects(execute({ clientId: 'first', signal: controller.signal },
    { operation: 'open', args: { url: PAGE_URL, background: false } }), /已取消/);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
  assert.deepEqual(state.updates, []);
});

test('denied Chrome website access prevents tab creation', async () => {
  chrome.permissions.contains = async () => false;
  await assert.rejects(open(), /允许浏览器助手访问/);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
  assert.deepEqual([...state.groups.keys()], [USER_GROUP_ID]);
});

test('a requested operation on an existing page keeps its original group', async () => {
  await execute({ clientId: 'first' },
    { operation: 'navigate', args: { tabId: USER_TAB_ID, url: 'https://example.com/next' } });
  assert.equal(state.tabs.get(USER_TAB_ID).groupId, USER_GROUP_ID);
  assert.deepEqual([...state.groups.keys()], [USER_GROUP_ID]);
  assert.deepEqual([...state.tabs.keys()], [USER_TAB_ID]);
});

async function newNavigation(sourceTabId, properties = {}) {
  const tab = await chrome.tabs.create({ url: PAGE_URL, active: false, ...properties });
  for (const listener of navigationListeners) listener({ sourceTabId, tabId: tab.id });
  return tab;
}

test('input children are owned and cleaned up without claiming manual or unrelated pages in the group', async () => {
  const parent = await open();
  const manual = await newNavigation(parent.tabId, { groupId: parent.groupId });
  let child;
  let unrelated;
  const result = await withNewTabs({ clientId: 'first' }, parent.tabId, async () => {
    // Chrome may expose the selected user tab as openerTabId for background input.
    child = await newNavigation(parent.tabId, { openerTabId: USER_TAB_ID });
    unrelated = await newNavigation(USER_TAB_ID, { groupId: parent.groupId });
    return { clicked: true };
  });
  assert.deepEqual(result, { clicked: true });
  assert.equal(navigationListeners.size, 0);
  const later = await newNavigation(parent.tabId, { groupId: parent.groupId });
  assert.equal(await workTabOwner(child.id), 'first');
  assert.equal(state.tabs.get(child.id).groupId, parent.groupId);
  const finished = await execute({ clientId: 'first' }, { operation: 'finish',
    args: { tabIds: [parent.tabId, child.id, manual.id, unrelated.id, later.id, USER_TAB_ID] } });
  assert.deepEqual(finished.closedTabIds, [parent.tabId, child.id]);
  assert.deepEqual(finished.keptTabIds, [manual.id, unrelated.id, later.id, USER_TAB_ID]);
  assert.deepEqual(finished.failedTabIds, []);
});

test('input on an existing user page claims only the new child and honors explicit keep on completion', async () => {
  const child = await withNewTabs({ clientId: 'first' }, USER_TAB_ID, () => newNavigation(USER_TAB_ID));
  assert.equal(await workTabOwner(USER_TAB_ID), undefined);
  assert.equal(state.tabs.get(USER_TAB_ID).groupId, USER_GROUP_ID);
  assert.equal(await workTabOwner(child.id), 'first');
  const finish = keepTabIds => execute({ clientId: 'first' },
    { operation: 'finish', args: { tabIds: [USER_TAB_ID, child.id], keepTabIds } });
  assert.deepEqual((await finish([child.id])).closedTabIds, []);
  assert.deepEqual((await finish([])).closedTabIds, []);
  assert.ok(state.tabs.has(child.id));
});

test('failed or cancelled input still records pages already opened and removes the listener', async () => {
  for (const cancelled of [false, true]) {
    const controller = new AbortController();
    let child;
    await assert.rejects(withNewTabs({ clientId: 'first', signal: controller.signal }, USER_TAB_ID, async () => {
      child = await newNavigation(USER_TAB_ID);
      if (cancelled) controller.abort();
      throw new Error('input interrupted');
    }), /input interrupted/);
    assert.equal(navigationListeners.size, 0);
    const result = await execute({ clientId: 'first' }, { operation: 'finish', args: { tabIds: [child.id] } });
    assert.deepEqual(result.closedTabIds, [child.id]);
  }
});

test('parallel input on different sources records each client without lost writes or ownership transfer', async () => {
  const first = await open('first');
  const second = await open('second');
  const children = await Promise.all([
    withNewTabs({ clientId: 'first' }, first.tabId, () => newNavigation(first.tabId)),
    withNewTabs({ clientId: 'second' }, second.tabId, () => newNavigation(second.tabId)),
  ]);
  assert.equal(await workTabOwner(children[0].id), 'first');
  assert.equal(await workTabOwner(children[1].id), 'second');
  assert.equal(state.session.browserWorkTabs.length, 4);
  assert.equal(navigationListeners.size, 0);
});

test('a different client cannot claim children of an owned source or overwrite an owned child', async () => {
  const other = await open('second');
  const child = await withNewTabs({ clientId: 'first' }, other.tabId, () => newNavigation(other.tabId));
  assert.equal(await workTabOwner(child.id), undefined);
  await withNewTabs({ clientId: 'first' }, USER_TAB_ID, async () => {
    for (const listener of navigationListeners) listener({ sourceTabId: USER_TAB_ID, tabId: other.tabId });
  });
  assert.equal(await workTabOwner(other.tabId), 'second');
  assert.equal(navigationListeners.size, 0);
});

test('duplicate navigation events and self-closing pages leave no duplicate or stale ownership', async () => {
  let live;
  let closed;
  await withNewTabs({ clientId: 'first' }, USER_TAB_ID, async () => {
    live = await newNavigation(USER_TAB_ID);
    for (const listener of navigationListeners) listener({ sourceTabId: USER_TAB_ID, tabId: live.id });
    closed = await newNavigation(USER_TAB_ID);
    await chrome.tabs.remove(closed.id);
  });
  assert.deepEqual(state.session.browserWorkTabs, [{ clientId: 'first', tabId: live.id }]);
});

test('popup windows are recorded for cleanup without trying to put them in a tab group', async () => {
  chrome.windows.get = async () => ({ type: 'popup' });
  const child = await withNewTabs({ clientId: 'first' }, USER_TAB_ID, () => newNavigation(USER_TAB_ID));
  assert.equal(state.tabs.get(child.id).groupId, -1);
  const result = await execute({ clientId: 'first' }, { operation: 'finish', args: { tabIds: [child.id] } });
  assert.deepEqual(result.closedTabIds, [child.id]);
});

test('grouping failure keeps child ownership so completion can still close the page', async () => {
  chrome.tabs.group = async () => { throw new Error('private browser details'); };
  let child;
  await assert.rejects(withNewTabs({ clientId: 'first' }, USER_TAB_ID, async () => {
    child = await newNavigation(USER_TAB_ID);
  }), /^Error: 新打开的页面未能完成整理，请检查后重试。$/);
  assert.equal(navigationListeners.size, 0);
  assert.equal(await workTabOwner(child.id), 'first');
  const result = await execute({ clientId: 'first' }, { operation: 'finish', args: { tabIds: [child.id] } });
  assert.deepEqual(result.closedTabIds, [child.id]);
});

test('ownership storage failure is reported and removes the listener instead of silently succeeding', async () => {
  chrome.storage.session.set = async () => { throw new Error('private storage details'); };
  await assert.rejects(withNewTabs({ clientId: 'first' }, USER_TAB_ID, () => newNavigation(USER_TAB_ID)),
    /^Error: 新打开的页面未能完成整理，请检查后重试。$/);
  assert.equal(navigationListeners.size, 0);
});
