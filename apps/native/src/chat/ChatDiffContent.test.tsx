import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';
import type { DiffFile } from '../../../../shared/chat/diff';
import { ChatDiffContent } from './ChatDiffContent';

const hooks = vi.hoisted(() => ({ state: [] as unknown[], refs: [] as { current: unknown }[],
  stateIndex: 0, refIndex: 0 }));
vi.mock('react', async original => ({ ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.state)) hooks.state[index] = initial;
    return [hooks.state[index], (next: unknown) => {
      hooks.state[index] = typeof next === 'function' ? next(hooks.state[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.refIndex++;
    return hooks.refs[index] ??= { current: initial };
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useContext: () => null,
}));
vi.mock('react-native', () => ({ Pressable: 'Button', Text: 'Text', View: 'View', ScrollView: 'HorizontalScroll' }));
vi.mock('../theme/styles', () => ({ createThemedStyles: () => () => ({}) }));
vi.mock('../i18n', () => ({ useLanguage() {}, t: (text: string) => text }));
vi.mock('./styles', () => ({ useStyles: () => ({}), palette: {} }));
vi.mock('./SelectableChatText', () => ({ SelectableChatText: 'SelectableText' }));
vi.mock('./CopyTextButton', () => ({ INLINE_COPY_WIDTH: 20 }));
vi.mock('./ChatFilePreview', () => ({ ChatFileContext: {} }));
vi.mock('./ChatCodeHighlight', () => ({ HighlightedCode: 'Code', fileLanguage: () => 'text' }));
vi.mock('../components/SheetScrollView', () => ({ SheetScrollView: 'SheetScroll' }));

beforeEach(() => {
  hooks.state = []; hooks.refs = [];
  vi.stubGlobal('React', React);
});
afterEach(() => vi.unstubAllGlobals());

function file(total: number): DiffFile {
  return { path: 'src/large.ts', kind: 'add', raw: '', added: total, removed: 0,
    lines: Array.from({ length: total }, (_, index) => ({ kind: 'add', text: `line ${index + 1}`, newLine: index + 1 })) };
}
function render(value: DiffFile) {
  hooks.stateIndex = 0; hooks.refIndex = 0;
  return ChatDiffContent({ file: value }) as ReactElement<ScrollViewProps>;
}
function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
const rows = (view: ReactElement) => nodes(view).filter(node => node.props.line).length;
function scroll(view: ReactElement<ScrollViewProps>, offset: number, contentHeight = 5000) {
  view.props.onScroll!({ nativeEvent: { contentOffset: { x: 0, y: offset },
    contentSize: { width: 1000, height: contentHeight }, layoutMeasurement: { width: 390, height: 600 } },
  } as NativeSyntheticEvent<NativeScrollEvent>);
}

it('appends the remaining 36 lines near the bottom of the sheet without a tap', () => {
  const value = file(236);
  const view = render(value);
  expect(rows(view)).toBe(200);
  scroll(view, 1000);
  expect(rows(render(value))).toBe(200);
  scroll(view, 4250);
  const complete = render(value);
  expect(rows(complete)).toBe(236);
  expect(nodes(complete).filter(node => typeof node.props.onPress === 'function')).toHaveLength(2);
  scroll(complete, 5200, 5800);
  expect(rows(render(value))).toBe(236);
});

it('waits for appended rows to lay out before accepting another burst of scroll events', () => {
  const value = file(650);
  const initial = render(value);
  for (let index = 0; index < 5; index++) scroll(initial, 4250);
  let view = render(value);
  expect(rows(view)).toBe(400);
  scroll(view, 4250);
  expect(rows(render(value))).toBe(400);
  view.props.onContentSizeChange!(1000, 9500);
  scroll(view, 8750, 9500);
  view = render(value);
  expect(rows(view)).toBe(600);
  view.props.onContentSizeChange!(1000, 14000);
  scroll(view, 13250, 14000);
  expect(rows(render(value))).toBe(650);
});

it('fills a resized viewport and retains manual loading as a fallback', () => {
  const value = file(650);
  let view = render(value);
  view.props.onContentSizeChange!(1000, 5000);
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 1200, height: 5100 } } };
  view.props.onLayout!(layout as Parameters<NonNullable<ScrollViewProps['onLayout']>>[0]);
  view = render(value);
  expect(rows(view)).toBe(400);
  const more = nodes(view).filter(node => typeof node.props.onPress === 'function').at(-1)!;
  (more.props.onPress as () => void)();
  expect(rows(render(value))).toBe(600);
});

it('automatically extends wrapped and side-by-side diffs using their displayed row count', () => {
  const value = file(436);
  let view = render(value);
  const buttons = nodes(view).filter(node => typeof node.props.onPress === 'function');
  (buttons[0].props.onPress as () => void)();
  view = render(value);
  expect(nodes(view).some(node => node.type === 'HorizontalScroll')).toBe(false);
  scroll(view, 4250);
  expect(rows(render(value))).toBe(400);
  (buttons[1].props.onPress as () => void)();
  view = render(value);
  view.props.onContentSizeChange!(1000, 9500);
  scroll(view, 8750, 9500);
  expect(nodes(render(value)).find(node => node.props.pairs)?.props.pairs).toHaveLength(436);
});
