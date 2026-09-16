const WORK_GROUPS_KEY = 'browserWorkGroups';
const WORK_GROUP_TITLE = 'Codex';
const WORK_GROUP_COLOR = 'green';
let changes = Promise.resolve();

// Serializing group creation avoids duplicate groups and lost session records on concurrent opens.
export function groupNewTab(clientId, tab) {
  const next = changes.catch(() => {}).then(() => assignGroup(clientId, tab));
  changes = next;
  return next;
}

async function assignGroup(clientId, tab) {
  const stored = await chrome.storage.session.get(WORK_GROUPS_KEY);
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
  }
  await chrome.storage.session.set({ [WORK_GROUPS_KEY]: groups });
  return groupId;
}
