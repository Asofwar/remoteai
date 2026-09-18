import { useCallback, useEffect, useRef } from 'react';
import { useThreadPagination } from '../../../../shared/remote-chat/client/useThreadPagination';
import type { ChatController, ChatState } from './types';

const LOAD_MORE_DISTANCE = 160;

export function useThreadListScroll(state: ChatState, controller: ChatController) {
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const checkNearEnd = useCallback(() => {
    const node = list.current;
    if (!node || !end.current || node.clientHeight <= 0) return false;
    const bounds = node.getBoundingClientRect();
    const sentinel = end.current.getBoundingClientRect();
    return sentinel.top <= bounds.bottom + LOAD_MORE_DISTANCE && sentinel.bottom >= bounds.top;
  }, []);
  const { setNearEnd, ...pagination } = useThreadPagination(state, controller, checkNearEnd);

  useEffect(() => {
    if (!list.current || !end.current) return;
    const observer = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      root: list.current, rootMargin: `0px 0px ${LOAD_MORE_DISTANCE}px 0px`,
    });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [setNearEnd]);

  return { list, end, ...pagination };
}
