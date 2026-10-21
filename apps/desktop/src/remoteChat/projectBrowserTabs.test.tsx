// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useProjectDocument } from '../../../../shared/project-browser/useProjectDocument';
import { useAutoSave } from '../../../../shared/project-browser/useAutoSave';
import { isDirty, ProjectDocuments } from '../../../../shared/project-browser/documents';
import type { ProjectBrowserClient, ProjectDocument } from '../../../../shared/project-browser/protocol';
import { autoSaveDelay } from '../../../../shared/project-browser/preferences';

const document = (path: string, text = path, revision = '1'): ProjectDocument =>
  ({ path, text, revision, kind: 'text', readOnly: false, size: text.length });
let client: ProjectBrowserClient;
let root: Root;
let files: ReturnType<typeof useProjectDocument>;
let delay = 1000;
let connected = true;
function Fixture({ cwd = '/project' }: { cwd?: string }) {
  files = useProjectDocument(client, cwd);
  useAutoSave({ tabs: files.tabs, store: files.store, delay, enabled: connected });
  return null;
}
const render = async (cwd?: string) => { await act(async () => root.render(<Fixture cwd={cwd} />)); };
const advance = async (milliseconds: number) => { await act(async () => vi.advanceTimersByTimeAsync(milliseconds)); };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  delay = 1000; connected = true;
  client = { list: vi.fn(), read: vi.fn(async ({ path }) => document(path)),
    save: vi.fn(async ({ path, text }) => document(path, text, '2')) };
  root = createRoot(globalThis.document.createElement('div'));
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it('retains independent drafts and selects existing tabs without rereading them', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('draft a'));
  await act(async () => files.open('/project/b'));
  act(() => files.edit('draft b'));
  await act(async () => files.open('/project/a'));
  expect(files.text).toBe('draft a');
  expect(files.tabs.map(tab => tab.text)).toEqual(['draft a', 'draft b']);
  expect(client.read).toHaveBeenCalledTimes(2);
  act(() => files.store.close('/project/a'));
  expect(files.activePath).toBe('/project/b');
  expect(files.text).toBe('draft b');
});

it('saves inactive tabs on their own deadlines without postponing them when another tab changes', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('first'));
  await advance(500);
  await act(async () => files.open('/project/b'));
  act(() => files.edit('second'));
  await advance(499);
  expect(client.save).not.toHaveBeenCalled();
  await advance(1);
  expect(client.save).toHaveBeenCalledWith({ cwd: '/project', path: '/project/a', text: 'first', revision: '1' });
  expect(files.dirty).toBe(true);
  await advance(500);
  expect(client.save).toHaveBeenCalledTimes(2);
  expect(files.tabs.some(isDirty)).toBe(false);
});

it('debounces typing, cancels disabled/offline saves, and resumes after reconnecting', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('first'));
  await advance(900);
  act(() => files.edit('latest'));
  await advance(900);
  expect(client.save).not.toHaveBeenCalled();
  delay = 0; await render(); await advance(2000);
  expect(client.save).not.toHaveBeenCalled();
  delay = 1000; connected = false; await render(); await advance(2000);
  expect(client.save).not.toHaveBeenCalled();
  connected = true; await render(); await advance(1);
  expect(client.save).toHaveBeenCalledTimes(1);
  expect(files.dirty).toBe(false);
});

it('keeps save responses scoped to their tab and queues newer edits without overlapping writes', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('first'));
  let finish!: (value: ProjectDocument) => void;
  vi.mocked(client.save).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await advance(1000);
  act(() => files.edit('latest'));
  await act(async () => files.open('/project/b'));
  await advance(2000);
  expect(client.save).toHaveBeenCalledTimes(1);
  await act(async () => finish(document('/project/a', 'first', '2')));
  expect(files.activePath).toBe('/project/b');
  await advance(1);
  expect(client.save).toHaveBeenLastCalledWith({
    cwd: '/project', path: '/project/a', text: 'latest', revision: '2',
  });
  expect(files.store.get('/project/a')?.text).toBe('latest');
});

it('stops auto-save retries on conflict and keeps the draft for manual recovery', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('keep'));
  vi.mocked(client.save).mockRejectedValueOnce(new Error('文件已在其他地方修改。'));
  await advance(1000); await advance(5000);
  expect(client.save).toHaveBeenCalledTimes(1);
  expect(files.dirty).toBe(true);
  await act(async () => files.save());
  expect(files.dirty).toBe(false);
});

it('preserves project tabs through unmounts and isolates projects and device clients', async () => {
  delay = 0;
  await act(async () => files.open('/project/a'));
  act(() => files.edit('keep my project draft'));
  await render('/other');
  expect(files.tabs).toHaveLength(0);
  await act(async () => files.open('/other/a'));
  await act(async () => root.render(null));
  await render('/project');
  expect(files.text).toBe('keep my project draft');
  expect(files.dirty).toBe(true);
  client = { ...client };
  await render('/project');
  expect(files.tabs).toHaveLength(0);
});

it('ignores a closed tab read after reopening the same path', async () => {
  let finish!: (value: ProjectDocument) => void;
  vi.mocked(client.read).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => { void files.open('/project/a'); });
  act(() => files.store.close('/project/a'));
  await act(async () => files.open('/project/a'));
  act(() => files.edit('new draft'));
  await act(async () => finish(document('/project/a', 'stale')));
  expect(files.text).toBe('new draft');
});

it('restores native snapshots with drafts and saved revisions', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('native draft'));
  const restored = new ProjectDocuments(client, '/project', files.store.getSnapshot());
  expect(restored.get('/project/a')?.text).toBe('native draft');
  expect(isDirty(restored.get('/project/a')!)).toBe(true);
  expect(restored.getSnapshot().activePath).toBe('/project/a');
});

it('resumes a native reload without auto-saving the draft that was being discarded', async () => {
  await act(async () => files.open('/project/a'));
  act(() => files.edit('discarded'));
  const snapshot = { ...files.store.getSnapshot(), tabs: files.tabs.map(tab => ({ ...tab, loading: true })) };
  const restored = new ProjectDocuments(client, '/project', snapshot);
  expect(restored.get('/project/a')?.loading).toBe(true);
  restored.resumeReads();
  await Promise.resolve();
  expect(restored.get('/project/a')?.loading).toBe(false);
  expect(restored.get('/project/a')?.text).toBe('/project/a');
  expect(client.save).not.toHaveBeenCalled();
});

it('validates persisted preferences and defaults to one second', () => {
  expect(autoSaveDelay(undefined)).toBe(1000);
  expect(autoSaveDelay(-1)).toBe(1000);
  expect(autoSaveDelay(0)).toBe(0);
  expect(autoSaveDelay(5000)).toBe(5000);
});
