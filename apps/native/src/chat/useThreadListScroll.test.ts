import { beforeEach, expect, it, vi } from 'vitest';
import { useThreadListScroll } from './useThreadListScroll';
import { initialChatState } from '../../../../shared/remote-chat/client/types';
import type { ChatController } from './controller';

const mock = vi.hoisted(() => ({
  states: [] as unknown[], slot: 0, offset: { current: 0 }, nearEnd: false,
  checkNearEnd: (): boolean => false,
}));
vi.mock('react', () => ({
  useRef: () => mock.offset,
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void) => effect(),
  useState: <T>(initial: T) => {
    const slot = mock.slot++;
    if (!(slot in mock.states)) mock.states[slot] = initial;
    return [mock.states[slot], (next: T) => { mock.states[slot] = next; }];
  },
}));
vi.mock('../../../../shared/remote-chat/client/useThreadPagination', () => ({
  useThreadPagination: (_state: unknown, _controller: unknown, checkNearEnd: () => boolean) => {
    mock.checkNearEnd = checkNearEnd;
    return { setNearEnd: (nearEnd: boolean) => { mock.nearEnd = nearEnd; } };
  },
}));

beforeEach(() => { mock.states = []; mock.slot = 0; mock.offset.current = 0; mock.nearEnd = false; });
const controller = {} as ChatController;
function render(layoutKey: string) {
  mock.slot = 0;
  return useThreadListScroll(initialChatState(), controller, layoutKey);
}
function layout() {
  const scroll = render('short');
  scroll.onLayout({ nativeEvent: { layout: { height: 800 } } } as Parameters<typeof scroll.onLayout>[0]);
  scroll.onContentSizeChange(360, 600);
  return render('short');
}

it('waits for native layout after appending rows and resumes only when scrolling near the new bottom', () => {
  layout();
  expect(mock.nearEnd).toBe(true);
  const appended = render('long');
  expect(mock.checkNearEnd()).toBe(false);
  appended.onContentSizeChange(360, 1800);
  const measured = render('long');
  expect(mock.nearEnd).toBe(false);
  measured.onScroll({ nativeEvent: { contentOffset: { y: 700 } } } as Parameters<typeof measured.onScroll>[0]);
  expect(mock.nearEnd).toBe(true);
});

it('continues loading a short collapsed group without waiting for an unchanged height to emit another event', () => {
  layout();
  render('short');
  expect(mock.checkNearEnd()).toBe(true);
});

it('does not load before measurement and rechecks after the viewport changes', () => {
  const initial = render('short');
  expect(mock.nearEnd).toBe(false);
  initial.onContentSizeChange(360, 600);
  render('short');
  expect(mock.nearEnd).toBe(false);
  const scroll = layout();
  scroll.onLayout({ nativeEvent: { layout: { height: 200 } } } as Parameters<typeof scroll.onLayout>[0]);
  render('short');
  expect(mock.nearEnd).toBe(false);
});
