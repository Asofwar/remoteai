import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useThreadPagination } from '../../../../shared/remote-chat/client/useThreadPagination';
import type { ChatController } from './controller';
import type { ChatState } from './types';

const LOAD_MORE_THRESHOLD = 0.5;

export function useThreadListScroll(state: ChatState, controller: ChatController, layoutKey: string) {
  const offset = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [content, setContent] = useState({ key: '', height: 0 });
  const checkNearEnd = useCallback(() => {
    // Appended rows must finish native layout before their old height can trigger another page.
    return content.key === layoutKey && viewportHeight > 0
      && content.height - offset.current - viewportHeight <= viewportHeight * LOAD_MORE_THRESHOLD;
  }, [content, layoutKey, viewportHeight]);
  const pagination = useThreadPagination(state, controller, checkNearEnd);
  const { setNearEnd } = pagination;

  useEffect(() => { setNearEnd(checkNearEnd()); }, [checkNearEnd, setNearEnd]);

  return {
    ...pagination,
    onLayout: (event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height),
    onContentSizeChange: (_width: number, height: number) => setContent({ key: layoutKey, height }),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
      setNearEnd(checkNearEnd());
    },
  };
}
