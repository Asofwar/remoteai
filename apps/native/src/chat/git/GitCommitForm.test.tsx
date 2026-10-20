import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitCommitForm } from './GitCommitForm';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';

vi.mock('react', async original => ({ ...await original<typeof React>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View', TextInput: 'Input',
  Platform: { OS: 'android' }, StyleSheet: { create: <T,>(value: T) => value } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('./GitTreeIcon', () => ({ GitSelectionMark: 'SelectionMark' }));

interface Props {
  children?: ReactNode; disabled?: boolean; editable?: boolean; onPress?: () => void;
  accessibilityLabel?: string; style?: unknown;
}
function nodes(tree: ReactNode): ReactElement<Props>[] {
  return Children.toArray(tree).flatMap(child => isValidElement<Props>(child)
    ? [child, ...nodes(child.props.children)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(child => isValidElement<Props>(child)
    ? text(child.props.children) : String(child)).join('');
}
function fixture(autoMessage = false) {
  return { autoMessage, busy: false, settingsBusy: false, message: '', selected: { 'one.txt': 'v1' },
    canGenerateMessage: true, canCommit: autoMessage, canCommitAndPush: autoMessage,
    generateMessage: vi.fn(), commit: vi.fn(), setAutoMessage: vi.fn() } as unknown as RemoteGit;
}
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

it('offers touch generation and disables the input in automatic mode', () => {
  const manual = fixture();
  const generation = nodes(GitCommitForm({ panel: manual })).find(node => node.props.onPress
    && text(node) === 'AI 生成')!;
  generation.props.onPress!();
  expect(manual.generateMessage).toHaveBeenCalledOnce();
  const automatic = fixture(true);
  const rendered = nodes(GitCommitForm({ panel: automatic }));
  expect(rendered.find(node => node.props.accessibilityLabel === '提交说明')!.props.editable).toBe(false);
  rendered.find(node => node.props.onPress && text(node) === '提交并推送')!.props.onPress!();
  expect(automatic.commit).toHaveBeenCalledWith({ push: true });
});

it('prevents setting changes while the host preference is loading or being saved', () => {
  const panel = { ...fixture(), settingsBusy: true };
  const checkbox = nodes(GitCommitForm({ panel })).find(node =>
    node.props.accessibilityLabel === '自动生成提交说明')!;
  expect(checkbox.props.disabled).toBe(true);
});
