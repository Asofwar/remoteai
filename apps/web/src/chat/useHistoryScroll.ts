import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessagesProps } from '../../../../shared/remote-chat/client/messageProps';

const EDGE_DISTANCE = 100;

export function useHistoryScroll({ thread, loadingMore, hasMore, loadOlder }: ChatMessagesProps) {
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showBottom, setShowBottom] = useState(false);
  const fetching = useRef(false);
  const position = useRef(0);
  const anchor = useRef<{ element: Element; top: number }>();
  const more = () => {
    if (!hasMore || loadingMore || fetching.current || !loadOlder || !list.current) return;
    following.current = false;
    const top = list.current.getBoundingClientRect().top;
    const element = [...list.current.querySelectorAll('[data-message-id]')]
      .find((item) => item.getBoundingClientRect().bottom > top);
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
    fetching.current = true;
    void loadOlder().finally(() => { fetching.current = false; });
  };
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (anchor.current?.element.isConnected) {
      node.scrollTop += anchor.current.element.getBoundingClientRect().top - anchor.current.top;
    } else if (following.current) node.scrollTop = node.scrollHeight;
    position.current = node.scrollTop;
    if (!loadingMore) anchor.current = undefined;
  }, [thread, loadingMore]);
  useLayoutEffect(() => {
    const follow = () => {
      if (following.current && list.current) {
        list.current.scrollTop = list.current.scrollHeight;
        position.current = list.current.scrollTop;
      }
    };
    const observer = new ResizeObserver(follow);
    if (content.current) observer.observe(content.current);
    if (list.current) observer.observe(list.current);
    follow();
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const node = list.current;
    if (!node) return;
    const upward = node.scrollTop < position.current;
    position.current = node.scrollTop;
    following.current = node.scrollHeight - node.clientHeight - node.scrollTop < EDGE_DISTANCE;
    setShowBottom(!following.current);
    if (upward && node.scrollTop < EDGE_DISTANCE) more();
  };
  const toBottom = () => {
    following.current = true;
    setShowBottom(false);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  };
  const pauseFollowing = () => { following.current = false; };
  return { list, content, onScroll, more, showBottom, toBottom, pauseFollowing };
}
