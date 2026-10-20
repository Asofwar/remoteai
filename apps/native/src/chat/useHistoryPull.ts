import type { GestureResponderEvent } from 'react-native';
import { useHistoryPull as usePull } from '../../../../shared/chat/useHistoryPull';

/** Keep top-edge pulls available without the system refresh spinner covering the conversation. */
export function useHistoryPull(atTop: () => boolean, loadOlder: () => Promise<void>) {
  const pull = usePull(atTop, () => { void loadOlder(); });
  const point = ({ nativeEvent }: GestureResponderEvent) => nativeEvent.touches.length === 1
    ? { x: nativeEvent.pageX, y: nativeEvent.pageY } : undefined;
  return {
    onTouchStart: (event: GestureResponderEvent) => pull.begin(point(event)),
    onTouchMove: (event: GestureResponderEvent) => pull.move(point(event)),
    onTouchEnd: pull.clear, onTouchCancel: pull.clear,
  };
}
