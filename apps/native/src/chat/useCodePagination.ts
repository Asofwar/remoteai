import { useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const PAGE_CHARS = 12_000;
const PREFETCH_DISTANCE = 200;
const SCROLL_EVENT_INTERVAL = 16;

/** Append code near the viewport edge without moving the reader's scroll position. */
export function useCodePagination(length: number) {
  const [limit, setLimit] = useState(PAGE_CHARS);
  const metrics = useRef({ height: 0, viewport: 0, offset: 0, pending: false });
  const appendNearEnd = () => {
    const current = metrics.current;
    if (current.pending || limit >= length || current.height <= 0 || current.viewport <= 0) return;
    if (current.height - current.viewport - current.offset > PREFETCH_DISTANCE) return;
    // Native scroll events may arrive repeatedly before the appended text has been laid out.
    current.pending = true;
    setLimit((value) => Math.min(length, value + PAGE_CHARS));
  };
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    metrics.current.offset = Math.max(0, nativeEvent.contentOffset.y);
    appendNearEnd();
  };
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    metrics.current.viewport = layout.height;
    appendNearEnd();
  };
  const onContentSizeChange = (_width: number, height: number) => {
    metrics.current.height = height;
    metrics.current.pending = false;
    // Wide or short chunks may not fill the viewport yet, so continue without requiring a scroll.
    appendNearEnd();
  };
  return { limit, onScroll, onLayout, onContentSizeChange, scrollEventThrottle: SCROLL_EVENT_INTERVAL };
}
