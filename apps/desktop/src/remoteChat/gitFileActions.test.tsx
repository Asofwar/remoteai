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
