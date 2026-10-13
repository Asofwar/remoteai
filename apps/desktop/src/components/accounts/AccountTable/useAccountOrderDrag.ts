import { useEffect, useRef, useState, type PointerEvent } from "react";

const SCROLL_EDGE_PX = 36;
const SCROLL_STEP_PX = 8;

/** Pointer events also work in desktop WebViews that intercept native HTML drag events. */
export function useAccountOrderDrag(onMove: (source: string, target: string) => void) {
  const listRef = useRef<HTMLOListElement>(null);
  const gesture = useRef<{ source: string; x: number; y: number } | null>(null);
  const frame = useRef<number>();
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const findTarget = (x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-account-order-id]");
    return row && listRef.current?.contains(row) ? row.dataset.accountOrderId ?? null : null;
  };
  const stop = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    gesture.current = null;
    setSource(null);
    setTarget(null);
  };
  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
  }, []);

  const scroll = () => {
    const list = listRef.current;
    const current = gesture.current;
    if (!list || !current) return;
    const rect = list.getBoundingClientRect();
    if (current.y < rect.top + SCROLL_EDGE_PX) list.scrollTop -= SCROLL_STEP_PX;
    else if (current.y > rect.bottom - SCROLL_EDGE_PX) list.scrollTop += SCROLL_STEP_PX;
    setTarget(findTarget(current.x, current.y));
    frame.current = requestAnimationFrame(scroll);
  };
  const start = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { source: id, x: event.clientX, y: event.clientY };
    setSource(id);
    setTarget(id);
    frame.current = requestAnimationFrame(scroll);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!gesture.current) return;
    gesture.current.x = event.clientX;
    gesture.current.y = event.clientY;
    setTarget(findTarget(event.clientX, event.clientY));
  };
  const drop = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    const destination = findTarget(event.clientX, event.clientY);
    if (current && destination) onMove(current.source, destination);
    stop();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return { listRef, source, target, start, move, drop, stop };
}
