import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { GIT_HISTORY_LOAD_DISTANCE, gitHistoryPageKey, useGitHistoryPagination }
  from '../../../../../shared/remote-chat/useGitHistoryPagination';

const SCROLL_EVENT_THROTTLE = 16;

export function useGitHistoryScroll(panel: RemoteGit, connected: boolean) {
  const pageKey = gitHistoryPageKey(panel);
  const offset = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [content, setContent] = useState({ key: '', height: 0 });
  const checkNearEnd = useCallback(() => {
    // Wait until appended rows reach native layout before using their new scroll range.
    return content.key === pageKey && viewportHeight > 0 && content.height > 0
      && content.height - offset.current - viewportHeight <= GIT_HISTORY_LOAD_DISTANCE;
  }, [content, pageKey, viewportHeight]);
  const { setNearEnd, ...pagination } = useGitHistoryPagination(panel, connected, checkNearEnd);
  useEffect(() => { setNearEnd(checkNearEnd()); }, [checkNearEnd, setNearEnd]);

  return { ...pagination, scrollEventThrottle: SCROLL_EVENT_THROTTLE,
    onLayout: (event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height),
    onContentSizeChange: (_width: number, height: number) => setContent({ key: pageKey, height }),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
      setNearEnd(checkNearEnd());
    },
  };
}
