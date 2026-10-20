// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRemoteGit, type RemoteGit } from '../../../../shared/remote-chat/useRemoteGit';
import { createAsyncGitFixture } from '../../../../shared/remote-chat/testing/gitFixture';

let client: ReturnType<typeof createAsyncGitFixture>;
let panel: RemoteGit;
let root: ReturnType<typeof createRoot>;
function Fixture({ cwd = '/project', connected = true }: { cwd?: string; connected?: boolean }) {
  panel = useRemoteGit({ client, cwd, active: true, connected });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = createAsyncGitFixture();
  vi.spyOn(client, 'fileAction'); vi.spyOn(client, 'commit');
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('requires confirmation and keeps the selected versions from before subsequent refreshes', async () => {
  const file = panel.changes!.files[0];
  await act(async () => panel.toggle(file));
  await act(async () => panel.requestFileAction('rollback'));
  expect(client.fileAction).not.toHaveBeenCalled();
  const next = structuredClone(panel.changes!);
  next.files[0].version = 'newer-edit';
  vi.spyOn(client, 'changes').mockResolvedValue(next);
  await act(async () => panel.refresh());
  expect(panel.selected).toEqual({});
  vi.mocked(client.fileAction).mockRejectedValueOnce(new Error('文件已变化'));
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).toHaveBeenCalledWith({ cwd: '/project', action: 'rollback', head: next.head,
    files: [{ path: file.path, version: file.version }] });
  expect(panel.error).toBe('文件已变化');
  expect(panel.fileAction).not.toBeNull();
});

it('cancels without mutation and rolls back only checked files after confirmation', async () => {
  await act(async () => panel.toggle(panel.changes!.files[0]));
  await act(async () => panel.requestFileAction('rollback'));
  await act(async () => panel.cancelFileAction());
  expect(client.fileAction).not.toHaveBeenCalled();
  await act(async () => panel.requestFileAction('rollback'));
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).toHaveBeenCalledTimes(1);
  expect(panel.changes!.files).toHaveLength(5);
  expect(panel.fileAction).toBeNull();
  expect(panel.notice).toBe('已回退所选文件');
});

it('commits a context file independently of checkbox selection and keeps the main draft', async () => {
  const [selected, target] = panel.changes!.files;
  await act(async () => { panel.toggle(selected); panel.setMessage('main draft'); });
  await act(async () => panel.requestFileAction('commit', target));
  await act(async () => panel.confirmFileAction(''));
  expect(client.commit).not.toHaveBeenCalled();
  await act(async () => panel.confirmFileAction('single file'));
  expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'single file',
    files: [{ path: target.path, version: target.version }] }));
  expect(panel.selected).toEqual({ [selected.path]: selected.version });
  expect(panel.message).toBe('main draft');
});

it('deletes only the context file and blocks actions offline or after changing projects', async () => {
  const [selected, target] = panel.changes!.files;
  await act(async () => panel.toggle(selected));
  await act(async () => panel.requestFileAction('delete', target));
  await act(async () => root.render(<Fixture connected={false} />));
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).not.toHaveBeenCalled();
  await act(async () => root.render(<Fixture />));
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete',
    files: [{ path: target.path, version: target.version }] }));
  await act(async () => panel.requestFileAction('rollback'));
  await act(async () => root.render(<Fixture cwd="/other" />));
  expect(panel.fileAction).toBeNull();
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).toHaveBeenCalledTimes(1);
});

it.each(['commit', 'rollback', 'delete'] as const)(
  '%s targets every descendant of a collapsed folder in its status group', async action => {
    const selected = panel.changes!.files.find(file => file.path === 'README.md')!;
    const folder = panel.fileList.rows.find(row => row.kind === 'folder' && row.id === 'unstaged:src')!;
    const files = folder.files.map(({ path, version }) => ({ path, version }));
    const head = panel.changes!.head;
    await act(async () => {
      panel.toggle(selected); panel.setMessage('keep draft'); panel.fileList.toggleFolder(folder.id);
    });
    expect(panel.fileList.rows.some(row => row.file?.path === 'src/chat/tools.ts')).toBe(false);
    await act(async () => panel.requestFileAction(action, folder.files));
    expect(panel.fileAction).toEqual({ action, head, files });
    expect(files.map(file => file.path).sort()).toEqual(['src/app.ts', 'src/chat/menu.ts', 'src/chat/tools.ts']);
    expect(client.commit).not.toHaveBeenCalled();
    expect(client.fileAction).not.toHaveBeenCalled();
    await act(async () => panel.confirmFileAction('folder changes'));
    const request = { cwd: '/project', head, files };
    if (action === 'commit') expect(client.commit).toHaveBeenCalledWith({ ...request, message: 'folder changes' });
    else expect(client.fileAction).toHaveBeenCalledWith({ ...request, action });
    expect(panel.selected).toEqual({ [selected.path]: selected.version });
    expect(panel.message).toBe('keep draft');
    expect(panel.changes!.files.some(file => file.path === 'src/theme.css')).toBe(true);
    expect(panel.fileAction).toBeNull();
  },
);

it('keeps folder versions and HEAD captured before a refresh and ignores an empty target list', async () => {
  await act(async () => panel.toggle(panel.changes!.files[0]));
  await act(async () => panel.requestFileAction('rollback', []));
  expect(panel.fileAction).toBeNull();
  const folder = panel.fileList.rows.find(row => row.path === 'src/chat')!;
  const head = panel.changes!.head;
  const files = folder.files.map(({ path, version }) => ({ path, version }));
  await act(async () => panel.requestFileAction('rollback', folder.files));
  const next = structuredClone(panel.changes!);
  next.head = 'new-head';
  next.files = next.files.map(file => ({ ...file, version: `${file.version}-newer` }));
  vi.spyOn(client, 'changes').mockResolvedValue(next);
  await act(async () => panel.refresh());
  vi.mocked(client.fileAction).mockRejectedValueOnce(new Error('文件已变化'));
  await act(async () => panel.confirmFileAction());
  expect(client.fileAction).toHaveBeenCalledWith({ cwd: '/project', action: 'rollback', head, files });
  expect(panel.fileAction).not.toBeNull();
  expect(panel.error).toBe('文件已变化');
});
