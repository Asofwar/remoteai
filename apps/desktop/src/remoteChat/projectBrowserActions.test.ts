import { expect, it, vi } from 'vitest';
import { ProjectDocuments } from '../../../../shared/project-browser/documents';
import type { ProjectBrowserClient, ProjectDocument } from '../../../../shared/project-browser/protocol';

function fixture() {
  const client: ProjectBrowserClient = {
    list: vi.fn(),
    read: vi.fn(async ({ path }): Promise<ProjectDocument> =>
      ({ path, kind: 'text', text: 'disk', revision: '1', size: 4, readOnly: false })),
    save: vi.fn(async ({ path, text }): Promise<ProjectDocument> =>
      ({ path, kind: 'text', text, revision: '2', size: text.length, readOnly: false })),
    mutate: vi.fn().mockResolvedValue({ path: '/project/new', directory: true }),
  };
  return { client, store: new ProjectDocuments(client, '/project') };
}

it('rebases unsaved descendants after rename and saves to the new path', async () => {
  const { client, store } = fixture();
  await store.open('/project/old/nested/a.txt');
  store.edit('/project/old/nested/a.txt', 'unsaved');
  await store.mutate({ cwd: '/project', path: '/project/old', action: 'rename', name: 'new' });
  expect(store.getSnapshot().activePath).toBe('/project/new/nested/a.txt');
  expect(store.get('/project/new/nested/a.txt')?.text).toBe('unsaved');
  await store.save('/project/new/nested/a.txt');
  expect(client.save).toHaveBeenCalledWith({ cwd: '/project', path: '/project/new/nested/a.txt',
    text: 'unsaved', revision: '1' });
});

it('preserves drafts after failed deletion, and removes only affected tabs after successful deletion', async () => {
  const { client, store } = fixture();
  await store.open('/project/keep');
  await store.open('/project/old/a');
  store.edit('/project/old/a', 'draft');
  vi.mocked(client.mutate).mockRejectedValueOnce(new Error('denied'));
  const request = { cwd: '/project', path: '/project/old', action: 'delete' as const };
  await expect(store.mutate(request)).rejects.toThrow('denied');
  expect(store.get('/project/old/a')?.text).toBe('draft');
  expect(store.getSnapshot().mutationPath).toBeUndefined();
  await store.mutate(request);
  expect(store.getSnapshot().tabs.map(tab => tab.path)).toEqual(['/project/keep']);
});

it('serializes mutations against document reads, writes and other mutations', async () => {
  const { client, store } = fixture();
  await store.open('/project/old/a');
  store.edit('/project/old/a', 'draft');
  let finish!: (value: { path: string; directory: boolean }) => void;
  vi.mocked(client.mutate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const request = { cwd: '/project', path: '/project/old', action: 'move' as const, directory: '/project/new' };
  const mutation = store.mutate(request);
  expect(await store.save('/project/old/a')).toBe(false);
  await store.open('/project/other');
  await store.reload('/project/old/a');
  await expect(store.mutate(request)).rejects.toThrow('文件正在读写');
  expect(client.read).toHaveBeenCalledTimes(1);
  finish({ path: '/project/new/old', directory: true }); await mutation;
  expect(store.get('/project/new/old/a')?.text).toBe('draft');
});

it('requires saving draft contents before copying a folder', async () => {
  const { client, store } = fixture();
  await store.open('/project/old/a'); store.edit('/project/old/a', 'draft');
  const request = { cwd: '/project', path: '/project/old', action: 'copy' as const, directory: '/project' };
  await expect(store.mutate(request)).rejects.toThrow('请先保存');
  expect(client.mutate).not.toHaveBeenCalled();
  await store.save('/project/old/a');
  await store.mutate(request);
  expect(client.mutate).toHaveBeenCalledOnce();
});
