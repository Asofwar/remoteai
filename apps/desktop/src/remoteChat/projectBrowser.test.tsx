// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useProjectDocument } from '../../../../shared/project-browser/useProjectDocument';
import { useProjectTree } from '../../../../shared/project-browser/useProjectTree';
import type { ProjectBrowserClient, ProjectDocument } from '../../../../shared/project-browser/protocol';
import type { ProjectFilesResponse } from '../../../../shared/remote-chat/projectFiles';
import { editorLanguage } from '../../../../shared/project-browser/editorSetup';

let root: Root;
let client: ProjectBrowserClient;
let file: ReturnType<typeof useProjectDocument>;
let tree: ReturnType<typeof useProjectTree>;
const doc = (path = '/project/a.ts', text = 'original', revision = 'one'): ProjectDocument => ({
  path, kind: 'text', size: text.length, text, revision, readOnly: false,
});
function Fixture() {
  file = useProjectDocument(client, '/project');
  tree = useProjectTree(client, '/project', true);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  client = { list: vi.fn().mockResolvedValue({ directory: '/project', entries: [], parent: null, truncated: false }),
    read: vi.fn().mockResolvedValue(doc()), save: vi.fn(), mutate: vi.fn() };
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it('ignores a slow previous file read after selecting another file', async () => {
  let finish!: (document: ProjectDocument) => void;
  vi.mocked(client.read).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let first!: Promise<void>;
  act(() => { first = file.open('/project/a.ts'); });
  vi.mocked(client.read).mockResolvedValueOnce(doc('/project/b.ts', 'second'));
  await act(async () => file.open('/project/b.ts'));
  await act(async () => { finish(doc()); await first; });
  expect(file.document?.path).toBe('/project/b.ts');
  expect(file.text).toBe('second');
});

it('keeps newer typing dirty after a save finishes and sends only one concurrent save', async () => {
  await act(async () => file.open('/project/a.ts'));
  act(() => file.edit('first edit'));
  let finish!: (document: ProjectDocument) => void;
  vi.mocked(client.save).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let save!: Promise<boolean>;
  act(() => { save = file.save(); });
  await act(async () => { expect(await file.save()).toBe(false); });
  act(() => file.edit('newer edit'));
  await act(async () => { finish(doc('/project/a.ts', 'first edit', 'two')); await save; });
  expect(client.save).toHaveBeenCalledTimes(1);
  expect(client.save).toHaveBeenCalledWith({ cwd: '/project', path: '/project/a.ts',
    text: 'first edit', revision: 'one' });
  expect(file.text).toBe('newer edit');
  expect(file.dirty).toBe(true);
  expect(file.document?.revision).toBe('two');
});

it('preserves the draft and revision when a remote save fails', async () => {
  await act(async () => file.open('/project/a.ts'));
  act(() => file.edit('keep me'));
  vi.mocked(client.save).mockRejectedValue('文件已在其他地方修改。请先复制你的修改，再重新加载文件。');
  await act(async () => { expect(await file.save()).toBe(false); });
  expect(file.text).toBe('keep me');
  expect(file.dirty).toBe(true);
  expect(file.document?.revision).toBe('one');
  expect(file.error).toContain('其他地方修改');
});

it('ignores a directory response from before the tree refresh', async () => {
  let finish!: (response: ProjectFilesResponse) => void;
  vi.mocked(client.list).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let first!: Promise<void>;
  act(() => { first = tree.load('/project/old'); });
  await act(async () => tree.refresh());
  await act(async () => {
    finish({ directory: '/project/old', entries: [], parent: '/project', truncated: false }); await first;
  });
  expect(tree.directories['/project/old']).toBeUndefined();
});

it('uses file extensions for syntax and keeps prose as plain text', () => {
  expect(editorLanguage('notes.txt')).toBeNull();
  expect(editorLanguage('README.md')).toBeNull();
  expect(editorLanguage('application.log')).toBeNull();
  expect(editorLanguage('src/main.ts')?.name).toBe('TypeScript');
  expect(editorLanguage('src/main.rs')?.name).toBe('Rust');
  expect(editorLanguage('src/main.go')?.name).toBe('Go');
  expect(editorLanguage('Dockerfile')?.name).toBe('Dockerfile');
});
