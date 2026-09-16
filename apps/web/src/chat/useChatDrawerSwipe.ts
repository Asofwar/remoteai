import { useEffect } from 'react';

const START_DISTANCE = 12;
const COMPLETE_DISTANCE = 60;
const DIRECTION_RATIO = 1.5;
const LONG_PRESS_MS = 500;
const INTERACTIVE = 'input, textarea, select, [contenteditable="true"], video, audio, canvas, img';

interface Swipe { x: number; y: number; id: number; started: number; claimed: boolean }
interface Options { enabled: boolean; open: boolean; onOpenChange: (open: boolean) => void }

function swipeSurface(target: EventTarget | null, open: boolean) {
  if (!(target instanceof Element)) return null;
  const surface = target.closest(open ? '.chat-drawer' : '.chat-page:not([hidden]) .chat-message-region');
  if (!surface || target.closest(open ? INTERACTIVE : `${INTERACTIVE}, button, a`)) return null;
  // A horizontally scrollable table or code block owns its gesture, including at either edge.
  for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return null;
  }
  return surface;
}

export function useChatDrawerSwipe({ enabled, open, onOpenChange }: Options) {
  useEffect(() => {
    if (!enabled) return;
    let swipe: Swipe | null = null;
    const hasSelection = () => window.getSelection()?.isCollapsed === false;
    const cancel = () => { swipe = null; };
    const start = (event: TouchEvent) => {
      cancel();
      if (event.touches.length !== 1 || hasSelection() || !swipeSurface(event.target, open)) return;
      const touch = event.touches[0];
      swipe = { x: touch.clientX, y: touch.clientY, id: touch.identifier, started: Date.now(), claimed: false };
    };
    const move = (event: TouchEvent) => {
      if (!swipe) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch.identifier !== swipe.id || hasSelection()) { cancel(); return; }
      const dx = (touch.clientX - swipe.x) * (open ? -1 : 1);
      const dy = Math.abs(touch.clientY - swipe.y);
      if (!swipe.claimed && (dx < -START_DISTANCE || (dy > START_DISTANCE && dy >= Math.abs(dx))
        || Date.now() - swipe.started > LONG_PRESS_MS)) { cancel(); return; }
      if (dx > START_DISTANCE && dx > dy * DIRECTION_RATIO) swipe.claimed = true;
      if (swipe.claimed && event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      const current = swipe;
      cancel();
      if (!current?.claimed || event.touches.length || hasSelection()) return;
      const touch = Array.from(event.changedTouches).find(item => item.identifier === current.id);
      if (!touch) return;
      // Suppress the tap that could otherwise select a conversation after a closing swipe.
      if (event.cancelable) event.preventDefault();
      const dx = (touch.clientX - current.x) * (open ? -1 : 1);
      if (dx >= COMPLETE_DISTANCE && dx > Math.abs(touch.clientY - current.y) * DIRECTION_RATIO) onOpenChange(!open);
    };
    // The drawer is portaled to body, so delegate within the two explicit chat surfaces.
    document.addEventListener('touchstart', start, { capture: true, passive: true });
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', end, { capture: true, passive: false });
    document.addEventListener('touchcancel', cancel, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', start, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      document.removeEventListener('touchcancel', cancel, true);
    };
  }, [enabled, open, onOpenChange]);
}
