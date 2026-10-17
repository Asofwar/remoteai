import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

const PULL_DISTANCE = 60;

/** Keep top-edge pulls available without the system refresh spinner covering the conversation. */
export function useHistoryPull(atTop: () => boolean, loadOlder: () => Promise<void>) {
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const onTouchStart = ({ nativeEvent }: GestureResponderEvent) => {
    start.current = atTop() && nativeEvent.touches.length === 1
      ? { x: nativeEvent.pageX, y: nativeEvent.pageY } : undefined;
  };
  const onTouchMove = ({ nativeEvent }: GestureResponderEvent) => {
    if (!start.current) return;
    const dx = Math.abs(nativeEvent.pageX - start.current.x);
    const dy = nativeEvent.pageY - start.current.y;
    if (!atTop() || nativeEvent.touches.length !== 1 || dx > PULL_DISTANCE || dy < 0) {
      start.current = undefined;
      return;
    }
    if (dy < PULL_DISTANCE || dy <= dx) return;
    start.current = undefined;
    void loadOlder();
  };
  const clear = () => { start.current = undefined; };
  return { onTouchStart, onTouchMove, onTouchEnd: clear, onTouchCancel: clear };
}
