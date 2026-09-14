import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture, type TouchData } from 'react-native-gesture-handler';
import { runOnJS, runOnUI, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { INITIAL_TRANSFORM } from '../../../../shared/chat/imageTransform';
import { beginImageGesture, isImageGestureTap, updateImageGesture,
  type ImageGestureState, type ImageGestureTouch } from './imageGesture';

const PINCH_CLOSE_COOLDOWN_MS = 1000;

function points(touches: TouchData[]): ImageGestureTouch[] {
  'worklet';
  return touches.map((touch) => ({ identifier: String(touch.id), x: touch.absoluteX, y: touch.absoluteY }));
}

/** Keep touch tracking and image transforms on the UI thread while chat updates occupy JavaScript. */
export function useImageGestures(close: () => void, orientation: string) {
  const transform = useSharedValue(INITIAL_TRANSFORM);
  const current = useSharedValue<ImageGestureState | null>(null);
  const closeBlockedUntil = useSharedValue(0);
  const onClose = useRef(close);
  onClose.current = close;
  const closePreview = useCallback(() => onClose.current(), []);
  const gesture = useMemo(() => {
    const protectPinchClose = () => {
      'worklet';
      if (current.value?.pinched) closeBlockedUntil.value = Date.now() + PINCH_CLOSE_COOLDOWN_MS;
    };
    const updateTouches = (touches: TouchData[]) => {
      'worklet';
      if (!current.value || !touches.length) return;
      current.value = updateImageGesture(current.value, points(touches));
      transform.value = current.value.transform;
      protectPinchClose();
    };
    return Gesture.Manual().shouldCancelWhenOutside(false)
      .onTouchesDown((event, manager) => {
        if (!current.value) {
          current.value = beginImageGesture(transform.value, points(event.allTouches), Date.now());
          manager.begin();
          manager.activate();
        } else updateTouches(event.allTouches);
        protectPinchClose();
      })
      .onTouchesMove((event) => updateTouches(event.allTouches))
      .onTouchesUp((event, manager) => {
        protectPinchClose();
        // Android includes the lifting finger in allTouches; iOS may already have removed it.
        const remaining = event.allTouches.filter((touch) => !event.changedTouches.some((up) => up.id === touch.id));
        if (remaining.length) { updateTouches(remaining); return; }
        const tapped = isImageGestureTap(current.value, points(event.changedTouches),
          Date.now(), closeBlockedUntil.value);
        current.value = null;
        manager.end();
        if (tapped) runOnJS(closePreview)();
      })
      .onTouchesCancelled((_event, manager) => {
        protectPinchClose();
        current.value = null;
        manager.fail();
      })
      .onFinalize(() => { protectPinchClose(); current.value = null; });
  }, [transform, current, closeBlockedUntil, closePreview]);
  useEffect(() => {
    runOnUI(() => {
      'worklet';
      if (current.value?.pinched) closeBlockedUntil.value = Date.now() + PINCH_CLOSE_COOLDOWN_MS;
      current.value = null;
      transform.value = INITIAL_TRANSFORM;
    })();
  }, [orientation, transform, current, closeBlockedUntil]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [
    { translateX: transform.value.x }, { translateY: transform.value.y }, { scale: transform.value.scale },
  ] }));
  return { gesture, animatedStyle };
}
