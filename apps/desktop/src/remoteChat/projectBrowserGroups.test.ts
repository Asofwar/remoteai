import { expect, it, vi } from 'vitest';
import { ProjectDocuments } from '../../../../shared/project-browser/documents';
import { editorGroups, editorLayoutIds } from '../../../../shared/project-browser/editorGroups';
import { tabsToClose } from '../../../../shared/project-browser/tabCommands';
import type { ProjectBrowserClient, ProjectDocument } from '../../../../shared/project-browser/protocol';

async function fixture() {
  const client: ProjectBrowserClient = { list: vi.fn(), mutate: vi.fn(),
    read: vi.fn(async ({ path }): Promise<ProjectDocument> =>
      ({ path, kind: 'text', text: path, revision: '1', size: 10, readOnly: false })),
    save: vi.fn(async ({ path, text }): Promise<ProjectDocument> =>
      ({ path, kind: 'text', text, revision: '2', size: text.length, readOnly: false })) };
  const store = new ProjectDocuments(client, '/project');
  await store.open('/project/a'); await store.open('/project/b'); await store.open('/project/c');
  return { client, store, groups: () => editorGroups(store.getSnapshot().layout) };
}

it('duplicates views without duplicating drafts or reads, and closes only the selected view', async () => {
  const { client, store, groups } = await fixture();
  store.edit('/project/b', 'draft');
  store.split({ groupId: 'main', path: '/project/b', direction: 'right', move: false });
  const second = groups()[1].id;
  expect(groups().map(group => group.paths)).toEqual([
    ['/project/a', '/project/b', '/project/c'], ['/project/b'],
  ]);
  expect(client.read).toHaveBeenCalledTimes(3);
  expect(store.lastViews('main', ['/project/b'])).toEqual([]);
  store.close('/project/b', 'main');
  expect(store.get('/project/b')?.text).toBe('draft');
  expect(store.lastViews(second, ['/project/b'])).toEqual(['/project/b']);
  expect(await store.save('/project/b')).toBe(true);
  expect(client.save).toHaveBeenCalledOnce();
  store.close('/project/b', second);
  expect(groups()).toHaveLength(1);
  expect(store.getSnapshot().activeGroupId).toBe('main');
});

it('moves tabs into nested splits and retains the layout and drafts in snapshots', async () => {
  const { client, store, groups } = await fixture();
  store.split({ groupId: 'main', path: '/project/b', direction: 'right', move: true });
  store.split({ groupId: 'main', path: '/project/c', direction: 'down', move: true });
  expect(groups().map(group => group.paths)).toEqual([['/project/a'], ['/project/c'], ['/project/b']]);
  store.edit('/project/c', 'unsaved');
  const restored = new ProjectDocuments(client, '/project', store.getSnapshot());
  expect(restored.getSnapshot().layout).toEqual(store.getSnapshot().layout);
  expect(restored.getSnapshot().activePath).toBe('/project/c');
  expect(restored.get('/project/c')?.text).toBe('unsaved');
  await restored.open('/project/a');
  expect(editorGroups(restored.getSnapshot().layout)[1].paths).toEqual(['/project/c', '/project/a']);
});

it('keeps split identities unique after moving and closing nested groups', async () => {
  const { store, groups } = await fixture();
  store.split({ groupId: 'main', path: '/project/b', direction: 'right', move: true });
  const second = groups()[1].id;
  await store.open('/project/c', second);
  store.split({ groupId: second, path: '/project/c', direction: 'down', move: true });
  store.close('/project/b', second);
  store.split({ groupId: 'main', path: '/project/a', direction: 'right', move: false });
  const ids = editorLayoutIds(store.getSnapshot().layout);
  expect(new Set(ids).size).toBe(ids.length);
});

it('rebases every split view on rename and removes deleted files across groups', async () => {
  const { client, store, groups } = await fixture();
  store.split({ groupId: 'main', path: '/project/a', direction: 'right', move: false });
  store.edit('/project/a', 'draft');
  vi.mocked(client.mutate).mockResolvedValue({ path: '/project/renamed', directory: false });
  const reload = vi.fn().mockResolvedValue(undefined);
  store.subscribeEntries(reload);
  await store.mutate({ cwd: '/project', path: '/project/a', action: 'rename', name: 'renamed' });
  expect(groups().every(group => group.paths.includes('/project/renamed'))).toBe(true);
  expect(store.get('/project/renamed')?.text).toBe('draft');
  expect(reload).toHaveBeenCalledOnce();
  await store.mutate({ cwd: '/project', path: '/project/renamed', action: 'delete' });
  expect(groups()).toHaveLength(1);
  expect(store.getSnapshot().tabs.map(tab => tab.path)).toEqual(['/project/b', '/project/c']);
});

it('selects batch-close targets by the context tab order and leaves modified tabs alone', async () => {
  const { store } = await fixture();
  store.edit('/project/b', 'draft');
  const tabs = store.getSnapshot().tabs;
  expect(tabsToClose(tabs, '/project/b', 'close')).toEqual(['/project/b']);
  expect(tabsToClose(tabs, '/project/b', 'closeOthers')).toEqual(['/project/a', '/project/c']);
  expect(tabsToClose(tabs, '/project/b', 'closeRight')).toEqual(['/project/c']);
  expect(tabsToClose(tabs, '/project/b', 'closeUnmodified')).toEqual(['/project/a', '/project/c']);
  expect(tabsToClose(tabs, '/project/b', 'closeAll')).toEqual(['/project/a', '/project/b', '/project/c']);
});
