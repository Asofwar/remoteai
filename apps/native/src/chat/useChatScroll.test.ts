import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatScroll } from './useChatScroll';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], slot: 0, effects: [] as (() => void)[],
  cleanups: [] as (() => void)[], attached: { current: true } }));
vi.mock('react', () => ({
  useRef: <T>(current: T) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.values)) hooks.values[slot] = { current };
    return hooks.values[slot];
  },
  useState: <T>(initial: T) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.values)) hooks.values[slot] = initial;
    return [hooks.values[slot], (next: T | ((previous: T) => T)) => {
      hooks.values[slot] = typeof next === 'function'
        ? (next as (previous: T) => T)(hooks.values[slot] as T) : next;
    }];
  },
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => (() => void) | void) => { hooks.effects.push(() => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }); },
}));
vi.mock('./useNativeChatScroll', () => ({ useNativeChatScroll: () => ({
  available: true, attached: hooks.attached, attach: vi.fn(), setFollowing: vi.fn(), finishLoadingOlder: vi.fn(),
}) }));

type Scroll = ReturnType<typeof useChatScroll>;
const VIEWPORT_HEIGHT = 720;
const FIRST_CONTENT_HEIGHT = 10_832;
const FINAL_CONTENT_HEIGHT = 11_074;
const NATIVE_FRAME_INTERVAL_MS = 17;
const FINAL_LAYOUT_DELAY_MS = 21;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  hooks.values = []; hooks.slot = 0; hooks.effects = []; hooks.cleanups = [];
  hooks.attached.current = true;
  frames.clear(); nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });

function render(options: { latestItemId?: string; loading?: boolean; loadOlder?: () => Promise<void>;
  hasMore?: boolean; loadingMore?: boolean } = { latestItemId: 'last' }) {
  hooks.slot = 0;
  const scroll = useChatScroll<{ id: string }>({ ...options, bottomPadding: 16 });
  hooks.effects.splice(0).forEach(effect => effect());
  return scroll;
}

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
}

function layout(scroll: Scroll, height: number) {
  scroll.onLayout({ nativeEvent: { layout: { height: VIEWPORT_HEIGHT } } } as Parameters<Scroll['onLayout']>[0]);
  scroll.onContentSizeChange(393, height);
}

function scrollEvent(height: number, remaining = 0, viewport = VIEWPORT_HEIGHT): Parameters<Scroll['onScroll']>[0] {
  return { nativeEvent: { contentOffset: { y: height - viewport - remaining }, contentSize: { height },
    layoutMeasurement: { height: viewport } } } as Parameters<Scroll['onScroll']>[0];
}

function visibleTail(scroll: Scroll) {
  scroll.onItemLayout('last');
  scroll.onViewableItemsChanged({
    viewableItems: [{ item: { id: 'last' }, key: 'last', index: 15, isViewable: true }],
  });
}

it('reveals long history after two native bottom adjustments within the normal throttle interval', () => {
  const scroll = render();
  layout(scroll, FIRST_CONTENT_HEIGHT);
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT));
  scroll.onContentSizeChange(393, FINAL_CONTENT_HEIGHT);
  visibleTail(scroll);
  flushFrames();
  expect(render().initializing).toBe(true);
  // Android drops, rather than defers, a scroll event that arrives inside this throttle window.
  const nativeDropsFinalOffset = scroll.scrollEventThrottle
    >= Math.max(NATIVE_FRAME_INTERVAL_MS, FINAL_LAYOUT_DELAY_MS);
  if (!nativeDropsFinalOffset) scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT));
  flushFrames();
  const ready = render();
  expect(ready.initializing).toBe(false);
  expect(ready.scrollEventThrottle).toBe(100);
});

function touch(x: number, y: number, touches = 1): Parameters<Scroll['onTouchStart']>[0] {
  return { nativeEvent: { pageX: x, pageY: y, touches: Array(touches).fill({}) } } as
    Parameters<Scroll['onTouchStart']>[0];
}

it('loads short history once per downward pull without requiring a refresh control', async () => {
  const loadOlder = vi.fn(async () => {});
  const scroll = render({ latestItemId: 'last', loadOlder });
  scroll.onTouchStart(touch(20, 20));
  scroll.onTouchMove(touch(20, 45));
  expect(loadOlder).not.toHaveBeenCalled();
  scroll.onTouchMove(touch(20, 90));
  await Promise.resolve();
  scroll.onTouchMove(touch(20, 180));
  scroll.onTouchEnd();
  expect(loadOlder).toHaveBeenCalledOnce();
});

it('ignores sideways, upward, cancelled, multitouch and non-top pulls', () => {
  const loadOlder = vi.fn(async () => {});
  const scroll = render({ latestItemId: 'last', loadOlder });
  for (const move of [touch(100, 100), touch(20, 10), touch(20, 100, 2)]) {
    scroll.onTouchStart(touch(20, 20));
    scroll.onTouchMove(move);
    scroll.onTouchEnd();
  }
  scroll.onTouchStart(touch(20, 20));
  scroll.onTouchCancel();
  scroll.onTouchMove(touch(20, 100));
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT));
  scroll.onTouchStart(touch(20, 20));
  scroll.onTouchMove(touch(20, 100));
  expect(loadOlder).not.toHaveBeenCalled();
});

it('prevents overlapping pulls and still loads when scrolling lands exactly at the top', async () => {
  let finish!: () => void;
  const loadOlder = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const scroll = render({ latestItemId: 'last', loadOlder, hasMore: true });
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT));
  scroll.onScrollBeginDrag();
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT, FIRST_CONTENT_HEIGHT - VIEWPORT_HEIGHT));
  expect(loadOlder).toHaveBeenCalledOnce();
  scroll.onTouchStart(touch(20, 20));
  scroll.onTouchMove(touch(20, 100));
  expect(loadOlder).toHaveBeenCalledOnce();
  finish();
  await Promise.resolve();
});

it('keeps initial events unthrottled until the real latest cell replaces the virtualization spacer', () => {
  const scroll = render();
  layout(scroll, FINAL_CONTENT_HEIGHT);
  scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT));
  scroll.onItemLayout('last');
  flushFrames();
  expect(render().initializing).toBe(true);
  expect(render().scrollEventThrottle).toBeLessThan(NATIVE_FRAME_INTERVAL_MS);
  visibleTail(scroll);
  flushFrames();
  expect(render().initializing).toBe(false);
});

it('waits for the first history response even when early content is already positioned', () => {
  render({ loading: true });
  const scroll = render({ latestItemId: 'last', loading: true });
  layout(scroll, FINAL_CONTENT_HEIGHT);
  visibleTail(scroll);
  scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT));
  flushFrames();
  expect(render({ latestItemId: 'last', loading: true }).initializing).toBe(true);
  render({ latestItemId: 'last', loading: false });
  flushFrames();
  expect(render().initializing).toBe(false);
});

it('cancels pending presentation frames when leaving the conversation', () => {
  render();
  expect(frames.size).toBeGreaterThan(0);
  hooks.cleanups.forEach(cleanup => cleanup());
  expect(frames.size).toBe(0);
});

it.each([400, 720])('shows the bottom shortcut only beyond 20 percent of a %i pixel viewport', (viewport) => {
  const scroll = render();
  layout(scroll, FINAL_CONTENT_HEIGHT);
  scroll.onScrollBeginDrag();
  const threshold = viewport * 0.2;
  for (const [remaining, visible] of [[threshold + 1, true], [threshold, false], [0, false]] as const) {
    scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT, remaining, viewport));
    expect(render().showScrollToBottom).toBe(visible);
  }
});

it.each(['onScrollEndDrag', 'onMomentumScrollEnd'] as const)(
  'hides the bottom shortcut on %s when the last scroll event was dropped', (finish) => {
    const scroll = render();
    layout(scroll, FINAL_CONTENT_HEIGHT);
    scroll.onScrollBeginDrag();
    scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT, VIEWPORT_HEIGHT));
    expect(render().showScrollToBottom).toBe(true);
    scroll[finish](scrollEvent(FINAL_CONTENT_HEIGHT));
    expect(render().showScrollToBottom).toBe(false);
  },
);

it('uses content and viewport measurements from the final native event instead of stale layouts', () => {
  const scroll = render();
  layout(scroll, FINAL_CONTENT_HEIGHT);
  scroll.onScrollBeginDrag();
  scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT, VIEWPORT_HEIGHT));
  // A collapsed activity group can update the native scroll range before onContentSizeChange arrives.
  scroll.onMomentumScrollEnd(scrollEvent(FIRST_CONTENT_HEIGHT, 120, 600));
  expect(render().showScrollToBottom).toBe(false);
  scroll.onScrollBeginDrag();
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT, 121, 600));
  expect(render().showScrollToBottom).toBe(true);
});

it('refreshes the shortcut when content or viewport height changes while reading earlier messages', () => {
  const scroll = render();
  layout(scroll, FINAL_CONTENT_HEIGHT);
  scroll.onScrollBeginDrag();
  scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT, 200));
  scroll.onScrollEndDrag(scrollEvent(FINAL_CONTENT_HEIGHT, 200));
  expect(render().showScrollToBottom).toBe(true);
  scroll.onContentSizeChange(393, FINAL_CONTENT_HEIGHT - 100);
  expect(render().showScrollToBottom).toBe(false);
  scroll.onContentSizeChange(393, FINAL_CONTENT_HEIGHT);
  expect(render().showScrollToBottom).toBe(true);
  scroll.onLayout({ nativeEvent: { layout: { height: 800 } } } as Parameters<Scroll['onLayout']>[0]);
  expect(render().showScrollToBottom).toBe(false);
});

it.each([true, false])('keeps the shortcut hidden while following growing content (native: %s)', (attached) => {
  hooks.attached.current = attached;
  const scroll = render();
  layout(scroll, FIRST_CONTENT_HEIGHT);
  scroll.onScroll(scrollEvent(FIRST_CONTENT_HEIGHT));
  scroll.onContentSizeChange(393, FINAL_CONTENT_HEIGHT);
  expect(render().showScrollToBottom).toBe(false);
  scroll.onScroll(scrollEvent(FINAL_CONTENT_HEIGHT));
  expect(render().showScrollToBottom).toBe(false);
});
