import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GitMenu, type GitMenuTarget } from './GitMenu';
import { GitFileActionConfirmation, GitRevisionConfirmation } from './GitActionConfirmations';
import { GitRow } from './GitChanges';
import { GitHistory } from './GitHistory';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import type { GitFileRow } from '../../../../../shared/remote-chat/useGitFileList';
import type { GitCommit } from '../../../../../shared/remote-chat/gitTypes';

const state = vi.hoisted(() => ({ mode: 'mixed', copy: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof React>(),
  useState: (initial: unknown) => initial === 'mixed'
    ? [state.mode, (mode: string) => { state.mode = mode; }] : [initial, vi.fn()],
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View',
  ScrollView: 'ScrollView', TextInput: 'Input', Platform: { OS: 'android' },
  StyleSheet: { create: <T,>(value: T) => value } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('./GitTreeIcon', () => ({ GitTreeIcon: 'TreeIcon', GitSelectionMark: 'SelectionMark' }));
vi.mock('expo-clipboard', () => ({ setStringAsync: state.copy }));
vi.mock('./useGitHistoryScroll', () => ({ useGitHistoryScroll: () => ({}) }));

interface NodeProps {
  children?: ReactNode; disabled?: boolean; onPress?: () => void; onLongPress?: () => void;
  accessibilityLabel?: string; delayLongPress?: number; confirm?: () => void; close?: () => void;
}
function nodes(tree: ReactNode): ReactElement<NodeProps>[] {
  return Children.toArray(tree).flatMap(child => isValidElement<NodeProps>(child)
    ? [child, ...nodes(child.props.children)] : []);
}
function action(tree: ReactNode, label: string) {
  return nodes(tree).find(node => node.props.accessibilityLabel === label)!;
}
const file = { path: 'src/app.ts', version: 'v1', status: ' M', conflict: false, originalPath: null };
const row = { kind: 'file', path: file.path, name: 'app.ts', file, files: [file], depth: 0,
  area: { id: 'unstaged' }, id: file.path } as GitFileRow;
const commit: GitCommit = { hash: 'a'.repeat(40), subject: 'first', author: 'author',
  date: '2026-01-01T00:00:00Z', refs: [], parents: [] };
function panel() {
  return { busy: false, changes: { files: [file], branch: 'main' }, selected: {}, message: 'Commit changes',
    commits: [commit], requestFileAction: vi.fn(), requestRevisionAction: vi.fn(), setDetail: vi.fn(),
    confirmFileAction: vi.fn(), cancelFileAction: vi.fn(), confirmRevisionAction: vi.fn(),
    cancelRevisionAction: vi.fn(), performHistoryAction: vi.fn(async (run: () => Promise<void>) => run()),
  } as unknown as RemoteGit;
}
function renderMenu(target: GitMenuTarget, git = panel()) {
  const close = vi.fn(); const onPatch = vi.fn().mockResolvedValue(undefined);
  const tree = GitMenu({ target, panel: git, connected: true, close, onPatch, patchNotice: '已加入下载管理。' });
  return { tree, close, onPatch, git };
}
beforeEach(() => { state.mode = 'mixed'; vi.clearAllMocks(); vi.stubGlobal('React', React); });

it('long presses open menus while ordinary presses still open file and commit details', () => {
  const git = panel(); const onMenu = vi.fn();
  const fileTree = GitRow({ row, panel: git, connected: true, flat: true, onMenu, onToggle: vi.fn() });
  const fileButton = nodes(fileTree).find(node => node.props.onLongPress)!;
  expect(fileButton.props.delayLongPress).toBe(500);
  fileButton.props.onLongPress!();
  expect(onMenu).toHaveBeenCalledWith(row);
  expect(git.setDetail).not.toHaveBeenCalled();
  fileButton.props.onPress!();
  expect(git.setDetail).toHaveBeenCalledWith({ kind: 'diff', path: file.path, title: file.path });
  vi.mocked(git.setDetail).mockClear();
  const history = GitHistory({ panel: git, connected: true, onMenu });
  const commitButton = nodes(history).find(node => node.props.onLongPress)!;
  commitButton.props.onLongPress!();
  expect(onMenu).toHaveBeenCalledWith(commit);
  expect(git.setDetail).not.toHaveBeenCalled();
  commitButton.props.onPress!();
  expect(git.setDetail).toHaveBeenCalledWith({ kind: 'files', commit });
});

it('folder actions preserve their target files and exclude already deleted files', () => {
  const deleted = { ...file, path: 'deleted.ts', status: ' D' };
  const folder = { ...row, kind: 'folder' as const, files: [file, deleted] };
  const { tree, git, close } = renderMenu({ kind: 'file', row: folder });
  action(tree, '提交文件夹内改动').props.onPress!();
  expect(git.requestFileAction).toHaveBeenLastCalledWith('commit', folder.files);
  action(tree, '删除文件夹内改动文件').props.onPress!();
  expect(git.requestFileAction).toHaveBeenLastCalledWith('delete', [file]);
  expect(git.confirmFileAction).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(2);
});

it('copies the full hash and offers patch, checkout and reset for the held commit', async () => {
  const { tree, git, onPatch } = renderMenu({ kind: 'commit', commit });
  action(tree, '复制提交哈希').props.onPress!();
  await Promise.resolve();
  expect(state.copy).toHaveBeenCalledWith(commit.hash);
  action(tree, '创建补丁…').props.onPress!();
  expect(onPatch).toHaveBeenCalledWith(commit);
  action(tree, '检出此提交…').props.onPress!();
  expect(git.requestRevisionAction).toHaveBeenLastCalledWith('checkout', commit);
  action(tree, '重置当前分支到此提交…').props.onPress!();
  expect(git.requestRevisionAction).toHaveBeenLastCalledWith('reset', commit);
  expect(git.confirmRevisionAction).not.toHaveBeenCalled();
});

it('disables mutations for conflicts and reset for detached HEAD', () => {
  const git = panel();
  git.changes!.files = [{ ...file, conflict: true }];
  const fileMenu = renderMenu({ kind: 'file', row }, git).tree;
  expect(action(fileMenu, '回退单个文件').props.disabled).toBe(true);
  const historyMenu = renderMenu({ kind: 'commit', commit }, git).tree;
  expect(action(historyMenu, '检出此提交…').props.disabled).toBe(true);
  expect(action(historyMenu, '复制提交哈希').props.disabled).toBe(false);
  git.changes!.files = []; git.changes!.branch = null;
  expect(action(renderMenu({ kind: 'commit', commit }, git).tree, '重置当前分支到此提交…').props.disabled).toBe(true);
});

it('requires confirmation, defaults reset to mixed and supports selecting hard', () => {
  const git = panel();
  git.fileAction = { action: 'rollback', head: 'head', files: [file] };
  const fileDialog = GitFileActionConfirmation({ panel: git, connected: true })!;
  expect(git.confirmFileAction).not.toHaveBeenCalled();
  fileDialog.props.close();
  expect(git.cancelFileAction).toHaveBeenCalledOnce();
  fileDialog.props.confirm();
  expect(git.confirmFileAction).toHaveBeenCalledOnce();
  git.revisionAction = { action: 'reset', commit: commit.hash, subject: commit.subject,
    head: 'head', branch: 'main', files: [file] };
  let dialog = GitRevisionConfirmation({ panel: git, connected: true })!;
  dialog.props.confirm();
  expect(git.confirmRevisionAction).toHaveBeenLastCalledWith('mixed');
  action(dialog, '放弃改动（Hard）').props.onPress!();
  dialog = GitRevisionConfirmation({ panel: git, connected: true })!;
  expect(dialog.props.danger).toBe(true);
  dialog.props.confirm();
  expect(git.confirmRevisionAction).toHaveBeenLastCalledWith('hard');
  expect(GitRevisionConfirmation({ panel: git, connected: false })!.props.disabled).toBe(true);
});
