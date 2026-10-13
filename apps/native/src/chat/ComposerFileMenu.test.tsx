import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ComposerFileMenu } from './ComposerFileMenu';
import type { ProjectFile } from '../../../../shared/remote-chat/projectFiles';

const search = vi.hoisted(() => ({ entries: [
  { name: 'robot', path: '/remote/src/robot', directory: true, relativePath: 'src/robot' },
  { name: 'robot.ts', path: '/remote/src/robot.ts', directory: false, relativePath: 'src/robot.ts' },
], loading: false, error: '', truncated: true }));
vi.mock('../../../../shared/chat/useProjectFileCandidates', async original => ({
  ...await original<typeof import('../../../../shared/chat/useProjectFileCandidates')>(),
  useProjectFileCandidates: () => search,
}));
vi.mock('react-native', () => ({ FlatList: 'List', Pressable: 'Button', Text: 'Text', View: 'View' }));
vi.mock('@expo/vector-icons/Feather', () => ({ default: 'Icon' }));
vi.mock('../theme/styles', () => ({ createThemedStyles: () => () => ({}) }));
vi.mock('../theme/store', () => ({ useThemeColor: () => () => '#777' }));
vi.mock('../i18n', () => ({ useLanguage() {}, t: (text: string) => text }));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

it('keeps the keyboard open while tapping remote file and folder references', () => {
  const choose = vi.fn();
  const view = ComposerFileMenu({ query: 'robot', threadId: 'thread', cwd: '/remote', ready: true,
    load: vi.fn(), choose, close: vi.fn() });
  const list = view.props.children[1] as ReactElement<{
    keyboardShouldPersistTaps: string;
    renderItem: (options: { item: ProjectFile }) => ReactElement<{ onPress: () => void }>;
  }>;
  expect(list.props.keyboardShouldPersistTaps).toBe('always');
  for (const item of search.entries) list.props.renderItem({ item }).props.onPress();
  expect(choose.mock.calls).toEqual([
    [{ kind: 'folder', name: 'robot', path: '/remote/src/robot' }],
    [{ kind: 'file', name: 'robot.ts', path: '/remote/src/robot.ts' }],
  ]);
});
