// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAsyncGitFixture } from '../../../../shared/remote-chat/testing/gitFixture';
import { useRemoteGit, type RemoteGit } from '../../../../shared/remote-chat/useRemoteGit';

let client: ReturnType<typeof createAsyncGitFixture>;
let panel: RemoteGit;
let root: Root;
function Fixture({ cwd = '/project', connected = true }: { cwd?: string; connected?: boolean }) {
  panel = useRemoteGit({ client, cwd, connected, active: true });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = createAsyncGitFixture();
  vi.spyOn(client, 'commit'); vi.spyOn(client, 'action');
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Fixture />));
  await act(async () => { panel.toggle(panel.changes!.files[0]); panel.setMessage(' selected only '); });
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('pushes the new commit on the original branch after committing only selected files', async () => {
  const previousHead = panel.changes!.head;
  await act(async () => panel.commit({ push: true }));
  expect(client.commit).toHaveBeenCalledExactlyOnceWith({ cwd: '/project', head: previousHead,
    message: 'selected only', files: [{ path: 'src/app.ts', version: 'app-v1' }] });
  expect(panel.changes!.head).not.toBe(previousHead);
  expect(client.action).toHaveBeenCalledExactlyOnceWith({ cwd: '/project', action: 'push',
    head: panel.changes!.head, branch: 'main' });
  expect(panel.changes!.files.map(file => file.path)).toContain('README.md');
  expect(panel.selected).toEqual({});
  expect(panel.message).toBe('');
  expect(panel.notice).toBe('提交并推送完成');
});

it('keeps the existing commit action local', async () => {
  await act(async () => panel.commit());
  expect(client.commit).toHaveBeenCalledTimes(1);
  expect(client.action).not.toHaveBeenCalled();
});

it('keeps the draft and selection without pushing when commit fails', async () => {
  vi.mocked(client.commit).mockRejectedValueOnce(new Error('commit failed'));
  await act(async () => panel.commit({ push: true }));
  expect(client.action).not.toHaveBeenCalled();
  expect(panel.message).toBe(' selected only ');
  expect(panel.selected).toEqual({ 'src/app.ts': 'app-v1' });
  expect(panel.error).toBe('commit failed');
});

it('refreshes the successful commit after a failed push and permits retrying push alone', async () => {
  vi.mocked(client.action).mockRejectedValueOnce(new Error('push rejected'));
  await act(async () => panel.commit({ push: true }));
  expect(panel.notice).toBe('提交已完成，推送未完成。请稍后重试推送。');
  expect(panel.error).toBe('push rejected');
  expect(panel.changes!.files.map(file => file.path)).not.toContain('src/app.ts');
  expect(panel.message).toBe('');
  expect(panel.canCommitAndPush).toBe(false);
  await act(async () => panel.action('push'));
  expect(client.commit).toHaveBeenCalledTimes(1);
  expect(client.action).toHaveBeenCalledTimes(2);
  expect(panel.error).toBe('');
  expect(panel.notice).toBe('推送完成');
});

it('keeps both submit actions disabled throughout push and ignores duplicate submissions', async () => {
  let finish!: () => void;
  vi.mocked(client.action).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = panel.commit({ push: true }); });
  expect(panel.busy).toBe(true);
  expect(panel.canCommit).toBe(false);
  expect(panel.canCommitAndPush).toBe(false);
  await act(async () => { await panel.commit({ push: true }); await panel.commit(); });
  expect(client.commit).toHaveBeenCalledTimes(1);
  expect(client.action).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await pending; });
  expect(panel.busy).toBe(false);
});

it.each(['upstream', 'remote', 'branch'] as const)('requires a %s before committing and pushing', async missing => {
  const repository = await client.repository('/project');
  const changes = panel.changes!;
  if (missing === 'branch') vi.spyOn(client, 'changes').mockResolvedValue({ ...changes, branch: null });
  else vi.spyOn(client, 'repository').mockResolvedValue({ ...repository,
    upstream: missing === 'upstream' ? null : repository.upstream,
    remotes: missing === 'remote' ? [] : repository.remotes });
  await act(async () => panel.refresh());
  expect(panel.canCommit).toBe(true);
  expect(panel.canCommitAndPush).toBe(false);
  await act(async () => panel.commit({ push: true }));
  expect(client.commit).not.toHaveBeenCalled();
  expect(client.action).not.toHaveBeenCalled();
});

it('blocks commit and push while disconnected', async () => {
  await act(async () => root.render(<Fixture connected={false} />));
  expect(panel.canCommitAndPush).toBe(false);
  await act(async () => panel.commit({ push: true }));
  expect(client.commit).not.toHaveBeenCalled();
});

it('does not push after switching projects while commit is pending', async () => {
  let finish!: (result: { hash: string }) => void;
  vi.mocked(client.commit).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = panel.commit({ push: true }); });
  await act(async () => root.render(<Fixture cwd="/other" />));
  await act(async () => { finish({ hash: 'new-commit' }); await pending; });
  expect(client.action).not.toHaveBeenCalled();
  expect(panel.notice).toBe('');
  expect(panel.changes!.root).toBe('/other');
});
