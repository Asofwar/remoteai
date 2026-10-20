// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAsyncGitFixture } from '../../../../shared/remote-chat/testing/gitFixture';
import { useRemoteGit, type RemoteGit } from '../../../../shared/remote-chat/useRemoteGit';

let client: ReturnType<typeof createAsyncGitFixture>;
let panel: RemoteGit;
let root: Root;
function Fixture({ cwd = '/project', connected = true, active = true }:
  { cwd?: string; connected?: boolean; active?: boolean }) {
  panel = useRemoteGit({ client, cwd, connected, active, refreshInterval: 1000 });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = createAsyncGitFixture();
  vi.spyOn(client, 'generateMessage'); vi.spyOn(client, 'commit'); vi.spyOn(client, 'action');
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Fixture />));
  await act(async () => panel.toggle(panel.changes!.files[0]));
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('generates from the selected snapshot before committing (push=%s)', async push => {
  const head = panel.changes!.head;
  await act(async () => panel.setAutoMessage(true));
  expect(panel.canCommit).toBe(true);
  await act(async () => panel.commit({ push }));
  expect(client.generateMessage).toHaveBeenCalledExactlyOnceWith({ cwd: '/project', head, language: 'zh',
    files: [{ path: 'src/app.ts', version: 'app-v1' }] });
  expect(client.commit).toHaveBeenCalledExactlyOnceWith({ cwd: '/project', head,
    files: [{ path: 'src/app.ts', version: 'app-v1' }], message: 'feat: 更新 src/app.ts' });
  expect(client.action).toHaveBeenCalledTimes(Number(push));
  expect(panel.changes!.files.map(file => file.path)).toContain('README.md');
});

it('fills an editable draft without committing and leaves existing text alone', async () => {
  await act(async () => panel.generateMessage());
  expect(panel.message).toBe('feat: 更新 src/app.ts');
  expect(panel.autoMessage).toBe(false);
  expect(client.commit).not.toHaveBeenCalled();
  await act(async () => panel.generateMessage());
  expect(client.generateMessage).toHaveBeenCalledTimes(1);
  await act(async () => panel.setMessage('my edit'));
  await act(async () => panel.commit());
  expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'my edit' }));
});

it('preserves the selection and draft after failure, then regenerates on retry', async () => {
  vi.mocked(client.generateMessage).mockRejectedValueOnce(new Error('generation failed'));
  await act(async () => { panel.setMessage('draft'); panel.setAutoMessage(true); });
  await act(async () => panel.commit({ push: true }));
  expect(panel.error).toBe('generation failed');
  expect(panel.selected).toEqual({ 'src/app.ts': 'app-v1' });
  expect(panel.message).toBe('draft');
  expect(client.commit).not.toHaveBeenCalled();
  expect(client.action).not.toHaveBeenCalled();
  await act(async () => panel.commit());
  expect(client.generateMessage).toHaveBeenCalledTimes(2);
  expect(client.commit).toHaveBeenCalledTimes(1);
});

it('keeps generation single-flight and selection locked until commit finishes', async () => {
  let finish!: (result: { message: string }) => void;
  vi.mocked(client.generateMessage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => panel.setAutoMessage(true));
  let pending!: Promise<void>;
  await act(async () => { pending = panel.commit(); });
  expect(panel.generatingMessage).toBe(true);
  expect(panel.canCommit).toBe(false);
  await act(async () => { panel.selectAll(); await panel.commit(); await panel.generateMessage(); });
  expect(panel.selected).toEqual({ 'src/app.ts': 'app-v1' });
  expect(client.generateMessage).toHaveBeenCalledTimes(1);
  expect(client.commit).not.toHaveBeenCalled();
  await act(async () => { finish({ message: 'fix: chosen files' }); await pending; });
  expect(panel.generatingMessage).toBe(false);
  expect(client.commit).toHaveBeenCalledTimes(1);
});

it.each(['project', 'disconnect', 'inactive'])('does not commit when %s changes during generation', async reason => {
  let finish!: (result: { message: string }) => void;
  vi.mocked(client.generateMessage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => panel.setAutoMessage(true));
  let pending!: Promise<void>;
  await act(async () => { pending = panel.commit({ push: true }); });
  await act(async () => root.render(<Fixture cwd={reason === 'project' ? '/other' : '/project'}
    connected={reason !== 'disconnect'} active={reason !== 'inactive'} />));
  await act(async () => { finish({ message: 'stale message' }); await pending; });
  expect(client.commit).not.toHaveBeenCalled();
  expect(client.action).not.toHaveBeenCalled();
  expect(panel.message).toBe('');
});

it('does not generate without a selection or commit an empty AI response', async () => {
  await act(async () => panel.toggle(panel.changes!.files[0]));
  await act(async () => panel.generateMessage());
  expect(client.generateMessage).not.toHaveBeenCalled();
  await act(async () => { panel.toggle(panel.changes!.files[0]); panel.setAutoMessage(true); });
  vi.mocked(client.generateMessage).mockResolvedValueOnce({ message: ' ' });
  await act(async () => panel.commit());
  expect(client.commit).not.toHaveBeenCalled();
  expect(panel.error).toContain('未能生成提交说明');
});
