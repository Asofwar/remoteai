import { useLayoutEffect, useMemo, useRef, useState, type RefObject, type WheelEvent } from "react";
import { messageWindow, type MessageCursor } from "./messageWindow";
import type { Turn } from "./types";

const LOAD_DISTANCE = 100;
const EMPTY_TURNS: Turn[] = [];
interface Options {
  turns?: Turn[];
  selected: string | null;
  active: boolean;
  viewport: RefObject<HTMLDivElement>;
  pauseFollowing: () => void;
  away: boolean;
}

function hasNestedScroller(target: EventTarget, viewport: Element): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== viewport) {
    // Keep scrolling inside code, tool output, and the composer independent from history loading.
    if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
    node = node.parentElement;
  }
  return false;
}

export function useMessageWindow({ turns = EMPTY_TURNS, selected, active, viewport, pauseFollowing, away }: Options) {
  const [window, setWindow] = useState<{ selected: string | null; active: boolean; start?: MessageCursor }>(
    { selected, active });
  const [loading, setLoading] = useState(false);
  const frame = useRef<number>();
  const position = useRef(0);
  const anchor = useRef<{ node: Element; top: number }>();
  const current = window.selected === selected && window.active === active;
  const start = current && active && away ? window.start : undefined;
  const visibleTurns = active ? turns : EMPTY_TURNS;
  const range = useMemo(() => messageWindow(visibleTurns, { start }), [visibleTurns, start]);
  const latest = useRef({ turns, range, selected, active });
  latest.current = { turns, range, selected, active };

  useLayoutEffect(() => {
    const changed = window.start?.turnId !== range.start?.turnId || window.start?.itemId !== range.start?.itemId;
    if (!current || (active && changed)) {
      setWindow({ selected, active, start: active ? range.start : undefined });
    }
  }, [selected, active, current, window.start, range.start]);

  useLayoutEffect(() => {
    anchor.current = undefined;
    position.current = viewport.current?.scrollTop ?? 0;
    setLoading(false);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    };
  }, [selected, active, viewport]);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (node && anchor.current?.node.isConnected) {
      node.scrollTop += anchor.current.node.getBoundingClientRect().top - anchor.current.top;
      position.current = node.scrollTop;
    }
    if (!loading) anchor.current = undefined;
  }, [range, loading, viewport]);

  const load = (update: () => void): boolean => {
    const node = viewport.current;
    if (!node || !active || frame.current !== undefined) return false;
    const top = node.getBoundingClientRect().top;
    const visible = [...node.querySelectorAll("[data-message-id], [data-history-anchor]")]
      .find((entry) => entry.getClientRects().length > 0 && entry.getBoundingClientRect().bottom > top);
    if (visible) anchor.current = { node: visible, top: visible.getBoundingClientRect().top };
    pauseFollowing();
    setLoading(true);
    // Allow the loading indicator to paint before mounting another batch of rich message components.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        const next = latest.current;
        if (next.selected !== selected || !next.active) return;
        update();
        setLoading(false);
      });
    });
    return true;
  };
  const loadPage = (direction: 'older' | 'newer') => {
    if (!(direction === 'older' ? range.hasMore : range.hasNewer)) return false;
    return load(() => {
      const next = latest.current;
      setWindow({ selected, active,
        start: messageWindow(next.turns, { start: next.range.start, [direction]: true }).start });
    });
  };
  const loadOlder = () => loadPage('older');
  const loadNewer = () => loadPage('newer');
  const onScroll = () => {
    const node = viewport.current;
    const top = node?.scrollTop ?? 0;
    const upward = top < position.current;
    const downward = top > position.current;
    position.current = top;
    if (frame.current !== undefined) return true;
    if (upward && top < LOAD_DISTANCE) return loadOlder();
    if (downward && node && node.scrollHeight - top - node.clientHeight < LOAD_DISTANCE) return loadNewer();
    return false;
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0
      || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const node = viewport.current;
    if (!node) return;
    if (hasNestedScroller(event.target, node)) return;
    if (frame.current !== undefined) return;
    // Collapsed activity can leave the viewport too short to emit a scroll event.
    if (event.deltaY < 0 && node.scrollTop <= 0) loadOlder();
    if (event.deltaY > 0 && node.scrollHeight - node.scrollTop - node.clientHeight < LOAD_DISTANCE) loadNewer();
  };
  return { ...range, loading, onScroll, onWheel, loadOlder, loadNewer };
}
