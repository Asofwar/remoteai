import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DeviceEventEmitter, findNodeHandle, Platform, type LayoutChangeEvent, type Text } from 'react-native';

interface TextOverflow { tag: number; width: number; height: number }
const LAYOUT_ROUNDING_TOLERANCE = 1;

/** Correct the actual Android line height when system font layout exceeds Fabric's measurement. */
export function useChatTextLayout(ref: RefObject<Text | null>, children: ReactNode) {
  const content = useRef(children);
  content.current = children;
  const [measurement, setMeasurement] = useState<{ content: ReactNode; width: number; height: number }>();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = DeviceEventEmitter.addListener('chatTextOverflow', (event: TextOverflow) => {
      if (event.tag !== findNodeHandle(ref.current) || !Number.isFinite(event.height) || event.height <= 0) return;
      if (!Number.isFinite(event.width) || event.width <= 0) return;
      const next = { content: content.current, width: event.width, height: Math.ceil(event.height) };
      setMeasurement(current => current?.content === next.content && current?.width === next.width
        && current?.height === next.height ? current : next);
    });
    return () => subscription.remove();
  }, [ref]);
  // Edited messages and streamed paragraphs must be free to shrink again.
  return {
    height: measurement && measurement.content === children ? measurement.height : undefined,
    onLayout: (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setMeasurement(current => current && Math.abs(current.width - width) > LAYOUT_ROUNDING_TOLERANCE
        ? undefined : current);
    },
  };
}
