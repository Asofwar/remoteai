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
  client = createAsyncGitFixture(); vi.spyOn(client, 'revision');
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('requires confirmation and pins the complete snapshot across background refreshes', async () => {
  const changes = structuredClone(panel.changes!);
  const commit = panel.commits[1];
  await act(async () => panel.requestRevisionAction('reset', commit));
  expect(client.revision).not.toHaveBeenCalled();
  const refreshed = structuredClone(changes); refreshed.files[0].version = 'edited-after-confirmation';
  vi.spyOn(client, 'changes').mockResolvedValue(refreshed);
  await act(async () => panel.refresh());
  vi.mocked(client.revision).mockRejectedValueOnce(new Error('文件或分支已变化，请刷新并重新选择文件。'));
  await act(async () => panel.confirmRevisionAction('hard'));
  expect(client.revision).toHaveBeenCalledWith({ cwd: '/project', action: 'reset', commit: commit.hash,
    head: changes.head, branch: changes.branch, mode: 'hard',
    files: changes.files.map(({ path, version }) => ({ path, version })) });
  expect(panel.error).toContain('已变化');
  expect(panel.revisionAction).not.toBeNull();
});

it('cancels without mutation and refreshes checkout into detached HEAD', async () => {
  await act(async () => panel.more());
  expect(panel.commits).toHaveLength(5);
  const commit = panel.commits[1];
  await act(async () => panel.requestRevisionAction('checkout', commit));
  await act(async () => panel.cancelRevisionAction());
  await act(async () => panel.confirmRevisionAction('mixed'));
  expect(client.revision).not.toHaveBeenCalled();
  await act(async () => panel.requestRevisionAction('checkout', commit));
  await act(async () => panel.confirmRevisionAction('mixed'));
  expect(client.revision).toHaveBeenCalledWith(expect.objectContaining({ action: 'checkout', commit: commit.hash }));
  expect(vi.mocked(client.revision).mock.calls[0][0]).not.toHaveProperty('mode');
  expect(panel.changes).toMatchObject({ branch: null, head: commit.hash });
  expect(panel.commits).toHaveLength(3);
  expect(panel.revisionAction).toBeNull();
  await act(async () => panel.requestRevisionAction('reset', commit));
  expect(panel.revisionAction).toBeNull();
});

it('does not execute twice, while offline, or after switching projects', async () => {
  await act(async () => panel.requestRevisionAction('reset', panel.commits[1]));
  await act(async () => root.render(<Fixture connected={false} />));
  await act(async () => panel.confirmRevisionAction('mixed'));
  expect(client.revision).not.toHaveBeenCalled();
  await act(async () => root.render(<Fixture />));
  await act(async () => Promise.all([panel.confirmRevisionAction('mixed'), panel.confirmRevisionAction('hard')]));
  expect(client.revision).toHaveBeenCalledTimes(1);
  await act(async () => panel.requestRevisionAction('reset', panel.commits[0]));
  await act(async () => root.render(<Fixture cwd="/another" />));
  expect(panel.revisionAction).toBeNull();
  await act(async () => panel.confirmRevisionAction('hard'));
  expect(client.revision).toHaveBeenCalledTimes(1);
});
