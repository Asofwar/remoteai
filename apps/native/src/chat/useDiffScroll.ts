import { useRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { DIFF_LOAD_THRESHOLD, useDiffPagination } from '../../../../shared/chat/useDiffPagination';

const SCROLL_EVENT_THROTTLE = 16;

export function useDiffScroll(total: number) {
  const { limit, loadMore } = useDiffPagination(total);
  const viewport = useRef({ height: 0, contentHeight: 0, offset: 0 });
  const requestedHeight = useRef<number | null>(null);
  const loadNearEnd = () => {
    const { height, contentHeight, offset } = viewport.current;
    if (limit >= total || height <= 0 || contentHeight <= 0 || requestedHeight.current === contentHeight) return;
    if (contentHeight - offset - height > DIFF_LOAD_THRESHOLD) return;
    // Wait for appended rows to reach native layout before accepting another scroll event.
    requestedHeight.current = contentHeight;
    loadMore();
  };
  const scrollProps: ScrollViewProps = {
    scrollEventThrottle: SCROLL_EVENT_THROTTLE,
    onScroll: ({ nativeEvent }) => {
      viewport.current = { height: nativeEvent.layoutMeasurement.height,
        contentHeight: nativeEvent.contentSize.height, offset: nativeEvent.contentOffset.y };
      loadNearEnd();
    },
    onLayout: ({ nativeEvent }) => {
      viewport.current.height = nativeEvent.layout.height;
      loadNearEnd();
    },
    onContentSizeChange: (_width, height) => {
      viewport.current.contentHeight = height;
      loadNearEnd();
    },
  };
  return { limit, loadMore, scrollProps };
}
