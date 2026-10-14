import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatProjectSwitch } from './ChatProjectSwitch';
import { ChatProjectPicker } from './ChatProjectPicker';
import { SheetFlatList } from '../components/SheetScrollView';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import type { ChatProject } from '../../../../shared/remote-chat/client/types';

const hooks = vi.hoisted(() => ({ cursor: 0, states: [] as unknown[], effectCursor: 0,
  effects: [] as Array<{ dependencies: unknown[]; cleanup?: () => void }>, pending: [] as Array<() => void> }));
vi.mock('react', async original => ({ ...await original<typeof React>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useMemo: (read: () => unknown) => read(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => {
      hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next;
    }];
  },
  useEffect: (effect: () => (() => void) | void, dependencies: unknown[]) => {
    const index = hooks.effectCursor++;
    const previous = hooks.effects[index];
    if (previous && dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))) return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects[index] = { dependencies, cleanup: effect() || undefined };
    });
  },
}));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable',
  ActivityIndicator: 'Spinner', Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: <T,>(styles: T) => styles } }));
vi.mock('@expo/vector-icons/Feather', () => ({ default: 'Icon' }));
vi.mock('../components/BottomSheet', () => ({ BottomSheet: 'Sheet' }));
vi.mock('../components/SheetScrollView', () => ({
  SheetFlatList: 'List', SheetInset: 'Inset', SHEET_READABLE_WIDTH: 440,
}));
vi.mock('./ChatProjectPicker', () => ({ ChatProjectPicker: 'DirectoryPicker' }));

interface Props {
  children?: ReactNode; accessibilityLabel?: string; disabled?: boolean; onPress?: () => void;
  data?: ChatProject[]; renderItem?: (input: { item: ChatProject }) => ReactElement<Props>;
  actions?: Array<{ label: string; onPress: () => void }>;
}
function descendants(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Props>(child)
    ? [child, ...descendants(child.props.children)] : []);
}
const saved = { cwd: '/work/saved', label: '已有项目' };
const request = vi.fn(async (_method: string, input?: unknown): Promise<unknown> => {
  const body = input as { operation: string; cwd: string };
  return body.operation === 'guiProjects' ? [saved] : { cwd: body.cwd, label: 'chosen' };
});
let controller: ChatController;
function render() {
  hooks.cursor = 0; hooks.effectCursor = 0;
  const nodes = descendants(ChatProjectSwitch({ state: controller.snapshot(), controller, active: true }));
  hooks.pending.splice(0).forEach(effect => effect());
  return nodes;
}
const trigger = () => render().find(node => node.props.accessibilityLabel === '选择项目')!;
async function open() {
  trigger().props.onPress!(); render();
  await Promise.resolve(); await Promise.resolve();
  return render();
}
beforeEach(() => {
  vi.stubGlobal('React', React);
  hooks.states = []; hooks.effects = []; hooks.pending = [];
  request.mockClear();
  controller = new ChatController(() => ({ start() {}, stop() {},
    request: async <T,>(method: string, input?: unknown) => await request(method, input) as T }));
  Object.assign(controller.snapshot(), { ready: true,
    threads: [{ id: 'old', ...saved, preview: '', updatedAt: 1 }] });
});
afterEach(() => {
  hooks.effects.forEach(effect => effect.cleanup?.());
  controller.stop(); vi.unstubAllGlobals();
});

it('offers saved projects once and applies the choice without starting a conversation', async () => {
  expect(request).not.toHaveBeenCalled();
  const list = (await open()).find(node => node.type === SheetFlatList)!;
  expect(list.props.data).toEqual([saved]);
  list.props.renderItem!({ item: saved }).props.onPress!();
  await Promise.resolve(); await Promise.resolve();
  expect(request).toHaveBeenCalledWith('request', {
    operation: 'guiProjectSelect', cwd: saved.cwd, threadId: undefined,
  });
  expect(controller.snapshot()).toMatchObject({ selected: null, draftProject: { cwd: saved.cwd } });
  expect(request.mock.calls.some(([, input]) => (input as { operation: string }).operation === 'start')).toBe(false);
});

it('opens new project folder selection and leaves the current project intact when cancelled', async () => {
  Object.assign(controller.snapshot(), { draftProject: saved });
  const sheet = (await open()).find(node => node.props.actions)!;
  sheet.props.actions!.find(action => action.label === '新建项目')!.onPress();
  const directory = render().find(node => node.type === ChatProjectPicker)!;
  const props = directory.props as React.ComponentProps<typeof ChatProjectPicker>;
  expect(props.title).toBe('新建项目');
  expect(props.cwd).toBe(saved.cwd);
  expect(props.load).toBe(controller.loadProjectDirectories);
  props.close();
  expect(render().some(node => node.type === ChatProjectPicker)).toBe(false);
  expect(controller.snapshot().draftProject).toEqual(saved);
});

it('prevents switching while a conversation is running', () => {
  Object.assign(controller.snapshot(), { selected: { id: 'running', ...saved, preview: '', updatedAt: 1,
    turns: [{ id: 'turn', status: 'inProgress', items: [] }] } });
  expect(trigger().props.disabled).toBe(true);
  trigger().props.onPress!();
  expect(render().some(node => node.type === SheetFlatList)).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
