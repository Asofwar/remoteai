import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { GuiController } from './controller';

const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};
const isVisible = () => document.visibilityState !== 'hidden';

/** Suspend presentation only; the shared controller, queue and remote host continue receiving events. */
export function useVisibleGuiState(controller: GuiController, active: boolean) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const enabled = active && visible;
  const last = useRef(controller.getSnapshot());
  const subscribe = useCallback((listener: () => void) =>
    enabled ? controller.subscribe(listener) : () => {}, [controller, enabled]);
  const snapshot = useCallback(() => {
    if (enabled) last.current = controller.getSnapshot();
    else if (Object.keys(last.current.conversations).length || Object.keys(last.current.queued).length
      || last.current.approvals.length) {
      // A frozen full snapshot would keep evicted histories and sent attachments alive in a hidden page.
      last.current = { ...last.current, conversations: {}, queued: {}, approvals: [] };
    }
    return last.current;
  }, [controller, enabled]);
  return { state: useSyncExternalStore(subscribe, snapshot), visible: enabled };
}
