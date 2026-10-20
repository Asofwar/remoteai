// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAsyncGitFixture } from '../../../../shared/remote-chat/testing/gitFixture';
import { useGitSettings } from '../../../../shared/remote-chat/useGitSettings';
import type { GitClient, GitSettings } from '../../../../shared/remote-chat/gitTypes';

let client: GitClient;
let root: Root;
const viewers: ReturnType<typeof useGitSettings>[] = [];
function Viewer({ id, host = client, enabled = true }: { id: number; host?: GitClient; enabled?: boolean }) {
  viewers[id] = useGitSettings(host, enabled);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers();
  client = createAsyncGitFixture(); vi.spyOn(client, 'settings');
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('syncs both directions between viewers and restores the host setting on reopening', async () => {
  await act(async () => root.render(<><Viewer id={0} /><Viewer id={1} /></>));
  await act(async () => viewers[0].setAutoMessage(true));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(viewers[1].autoMessage).toBe(true);
  await act(async () => viewers[1].setAutoMessage(false));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(viewers[0].autoMessage).toBe(false);
  await act(async () => viewers[0].setAutoMessage(true));
  await act(async () => root.render(null));
  await act(async () => root.render(<Viewer id={0} />));
  expect(viewers[0].autoMessage).toBe(true);
});

it('isolates computers and reloads the saved preference on reconnect', async () => {
  await client.settings(true);
  await act(async () => root.render(<Viewer id={0} />));
  expect(viewers[0].autoMessage).toBe(true);
  const other = createAsyncGitFixture();
  await act(async () => root.render(<Viewer id={0} host={other} />));
  expect(viewers[0].autoMessage).toBe(false);
  await act(async () => root.render(<Viewer id={0} enabled={false} />));
  await act(async () => root.render(<Viewer id={0} />));
  expect(viewers[0].autoMessage).toBe(true);
});

it('does not overlap reads or let an older read overwrite a saved change', async () => {
  let finish!: (settings: GitSettings) => void;
  await act(async () => root.render(<Viewer id={0} />));
  vi.mocked(client.settings).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(client.settings).toHaveBeenCalledTimes(2);
  let save!: Promise<void>;
  await act(async () => { save = viewers[0].setAutoMessage(true); });
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(client.settings).toHaveBeenCalledTimes(2);
  await act(async () => { finish({ autoMessage: false, revision: 0 }); await save; });
  expect(viewers[0].autoMessage).toBe(true);
  expect(client.settings).toHaveBeenLastCalledWith(true);
});

it('keeps the acknowledged setting on save failure and stops polling while hidden', async () => {
  await act(async () => root.render(<Viewer id={0} />));
  vi.mocked(client.settings).mockRejectedValueOnce(new Error('disk unavailable'));
  await act(async () => viewers[0].setAutoMessage(true));
  expect(viewers[0].autoMessage).toBe(false);
  expect(viewers[0].settingsError).toContain('无法同步');
  await act(async () => root.render(<Viewer id={0} enabled={false} />));
  const calls = vi.mocked(client.settings).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(client.settings).toHaveBeenCalledTimes(calls);
});
