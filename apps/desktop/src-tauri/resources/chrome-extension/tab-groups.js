const WORK_GROUPS_KEY = 'browserWorkGroups';
const WORK_TABS_KEY = 'browserWorkTabs';
const WORK_GROUP_TITLE = 'Remote AI';
const LEGACY_GROUP_TITLE = 'Codex';
const WORK_GROUP_COLOR = 'green';
let changes = Promise.resolve();

// Serializing group creation avoids duplicate groups and lost session records on concurrent opens.
export function groupNewTab(clientId, tab) {
  return serialize(() => assignGroup(clientId, tab));
}

function serialize(operation) {
  const next = changes.catch(() => {}).then(operation);
  changes = next;
  return next;
}

async function assignGroup(clientId, tab) {
  const stored = await chrome.storage.session.get([WORK_GROUPS_KEY, WORK_TABS_KEY]);
  const liveGroups = await chrome.tabGroups.query({});
  const groups = (stored[WORK_GROUPS_KEY] ?? []).filter((record) =>
    liveGroups.some((group) => group.id === record.groupId && group.windowId === record.windowId));
  const existing = groups.find((record) => record.clientId === clientId && record.windowId === tab.windowId);
  // Only reuse recorded groups; a user-created group with the same title remains untouched.
  const groupId = await chrome.tabs.group({ tabIds: [tab.id],
    ...(existing ? { groupId: existing.groupId } : { createProperties: { windowId: tab.windowId } }) });
  if (!existing) {
    await chrome.tabGroups.update(groupId, { title: WORK_GROUP_TITLE, color: WORK_GROUP_COLOR });
    groups.push({ clientId, windowId: tab.windowId, groupId });
  } else if (liveGroups.find(group => group.id === groupId)?.title === LEGACY_GROUP_TITLE) {
    await chrome.tabGroups.update(groupId, { title: WORK_GROUP_TITLE });
  }
  const tabs = (stored[WORK_TABS_KEY] ?? []).filter(record => record.tabId !== tab.id);
  tabs.push({ clientId, tabId: tab.id });
  await chrome.storage.session.set({ [WORK_GROUPS_KEY]: groups, [WORK_TABS_KEY]: tabs });
  return groupId;
}

export function renameWorkGroups() {
  return serialize(async () => {
    const stored = await chrome.storage.session.get(WORK_GROUPS_KEY);
    const liveGroups = await chrome.tabGroups.query({});
    for (const record of stored[WORK_GROUPS_KEY] ?? []) {
      const group = liveGroups.find(group => group.id === record.groupId);
      if (group?.title === LEGACY_GROUP_TITLE) {
        await chrome.tabGroups.update(group.id, { title: WORK_GROUP_TITLE });
      }
    }
  });
}

export async function workTabOwner(tabId) {
  const stored = await chrome.storage.session.get(WORK_TABS_KEY);
  return (stored[WORK_TABS_KEY] ?? []).find(record => record.tabId === tabId)?.clientId;
}

export function forgetWorkTab(tabId) {
  return serialize(async () => {
    const stored = await chrome.storage.session.get([WORK_GROUPS_KEY, WORK_TABS_KEY]);
    const liveGroups = await chrome.tabGroups.query({});
    await chrome.storage.session.set({
      [WORK_TABS_KEY]: (stored[WORK_TABS_KEY] ?? []).filter(record => record.tabId !== tabId),
      [WORK_GROUPS_KEY]: (stored[WORK_GROUPS_KEY] ?? [])
        .filter(record => liveGroups.some(group => group.id === record.groupId)),
    });
  });
}
