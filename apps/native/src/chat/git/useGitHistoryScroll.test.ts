import { beforeEach, expect, it, vi } from 'vitest';
import { useGitHistoryScroll } from './useGitHistoryScroll';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';

const mock = vi.hoisted(() => ({ states: [] as unknown[], slot: 0, offset: { current: 0 }, nearEnd: false,
  checkNearEnd: (): boolean => false }));
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
vi.mock('../../../../../shared/remote-chat/useGitHistoryPagination', async original => ({
  ...await original<typeof import('../../../../../shared/remote-chat/useGitHistoryPagination')>(),
  useGitHistoryPagination: (_panel: RemoteGit, _connected: boolean, checkNearEnd: () => boolean) => {
    mock.checkNearEnd = checkNearEnd;
    return { setNearEnd: (nearEnd: boolean) => { mock.nearEnd = nearEnd; } };
  },
}));
beforeEach(() => { mock.states = []; mock.slot = 0; mock.offset.current = 0; mock.nearEnd = false; });

function render(count = 30) {
  mock.slot = 0;
  const panel = { commits: Array.from({ length: count }, (_, index) => ({ hash: String(index) })) } as RemoteGit;
  return useGitHistoryScroll(panel, true);
}
function layout(height: number) {
  const scroll = render();
  scroll.onLayout({ nativeEvent: { layout: { height: 600 } } } as Parameters<typeof scroll.onLayout>[0]);
  scroll.onContentSizeChange(390, height);
  return render();
}

it('loads only near the bottom and waits for appended rows to finish native layout', () => {
  const scroll = layout(1600);
  expect(mock.nearEnd).toBe(false);
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 850 } } } as Parameters<typeof scroll.onScroll>[0]);
  expect(mock.nearEnd).toBe(true);
  const appended = render(60);
  expect(mock.checkNearEnd()).toBe(false);
  appended.onContentSizeChange(390, 3200);
  const measured = render(60);
  expect(mock.nearEnd).toBe(false);
  measured.onScroll({ nativeEvent: { contentOffset: { y: 2500 } } } as Parameters<typeof scroll.onScroll>[0]);
  expect(mock.nearEnd).toBe(true);
});

it('fills short lists after measurement and rechecks when the viewport changes', () => {
  render();
  expect(mock.nearEnd).toBe(false);
  const scroll = layout(500);
  expect(mock.nearEnd).toBe(true);
  scroll.onLayout({ nativeEvent: { layout: { height: 200 } } } as Parameters<typeof scroll.onLayout>[0]);
  render();
  expect(mock.nearEnd).toBe(false);
});
