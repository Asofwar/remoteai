import { beforeEach, expect, it, vi } from 'vitest';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useCodePagination } from './useCodePagination';

const state = vi.hoisted(() => ({ limit: 12_000, updates: [] as number[], refs: [] as { current: unknown }[], index: 0 }));
vi.mock('react', () => ({
  useState: () => [state.limit, (update: (value: number) => number) => {
    state.limit = update(state.limit);
    state.updates.push(state.limit);
  }],
  useRef: (current: unknown) => {
    const index = state.index++;
    return state.refs[index] ??= { current };
  },
}));
beforeEach(() => { state.limit = 12_000; state.updates = []; state.refs = []; state.index = 0; });

function render(length = 40_000) {
  state.index = 0;
  return useCodePagination(length);
}
const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as LayoutChangeEvent;
const scroll = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;

it('prefetches near the bottom and ignores repeated events until new content is laid out', () => {
  let pagination = render();
  pagination.onLayout(layout(600));
  pagination.onContentSizeChange(400, 2000);
  pagination.onScroll(scroll(1199));
  expect(state.updates).toEqual([]);
  pagination.onScroll(scroll(1200));
  pagination.onScroll(scroll(1250));
  pagination = render();
  pagination.onScroll(scroll(1300));
  expect(state.updates).toEqual([24_000]);
  pagination.onContentSizeChange(400, 4000);
  expect(state.updates).toEqual([24_000]);
  pagination.onScroll(scroll(3200));
  expect(state.updates).toEqual([24_000, 36_000]);
});

it('fills a short viewport and stops at the end of the file', () => {
  let pagination = render(25_000);
  pagination.onContentSizeChange(400, 100);
  expect(state.updates).toEqual([]);
  pagination.onLayout(layout(600));
  pagination = render(25_000);
  pagination.onContentSizeChange(800, 200);
  pagination = render(25_000);
  pagination.onContentSizeChange(900, 300);
  pagination.onScroll(scroll(0));
  expect(state.updates).toEqual([24_000, 25_000]);
});

it('handles viewport resizing without requiring another scroll gesture', () => {
  const pagination = render();
  pagination.onLayout(layout(300));
  pagination.onContentSizeChange(400, 1000);
  pagination.onScroll(scroll(400));
  expect(state.updates).toEqual([]);
  pagination.onLayout(layout(600));
  expect(state.updates).toEqual([24_000]);
});

it('does not paginate a fully visible file or an unmeasured viewport', () => {
  const pagination = render(1000);
  pagination.onScroll(scroll(500));
  pagination.onLayout(layout(600));
  pagination.onContentSizeChange(400, 100);
  expect(state.updates).toEqual([]);
});
