import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GestureTouchEvent, TouchData } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useImageGestures } from './useImageGestures';

vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: () => { throw new Error('Image movement must not schedule a React render'); },
  useCallback: (callback: unknown) => callback,
  useMemo: (create: () => unknown) => create(),
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (read: () => { transform: unknown }) => ({ get transform() { return read().transform; } }),
  runOnUI: (callback: unknown) => callback,
  runOnJS: vi.fn((callback: unknown) => callback),
}));
vi.mock('react-native-gesture-handler', () => ({ Gesture: { Manual: () => {
  const handlers: Record<string, unknown> = {};
  const builder: Record<string, unknown> = { handlers };
  for (const name of ['shouldCancelWhenOutside', 'onTouchesDown', 'onTouchesMove', 'onTouchesUp',
    'onTouchesCancelled', 'onFinalize']) builder[name] = (callback: unknown) => {
    handlers[name] = callback;
    return builder;
  };
  return builder;
} } }));

const finger = (identifier: string, pageX: number): TouchData =>
  ({ id: Number(identifier), absoluteX: pageX, absoluteY: 200, x: pageX, y: 200 });
const first = finger('1', 100);
const second = finger('2', 200);

function event(touches: TouchData[], changedTouches = touches): GestureTouchEvent {
  return { allTouches: touches, changedTouches, numberOfTouches: touches.length } as GestureTouchEvent;
}

function viewer() {
  const close = vi.fn();
  const { gesture, animatedStyle } = useImageGestures(close, 'portrait');
  const manager = { begin: vi.fn(), activate: vi.fn(), end: vi.fn(), fail: vi.fn() };
  // Replay platform touch ordering through the callbacks registered with the native gesture.
  const { handlers } = gesture as unknown as {
    handlers: Record<string, (event: GestureTouchEvent, stateManager: typeof manager) => void>;
  };
  const dispatch = (name: string, touchEvent: GestureTouchEvent) => {
    handlers[name]?.(touchEvent, manager);
  };
  const tap = () => {
    dispatch('onTouchesDown', event([first]));
    vi.advanceTimersByTime(50);
    dispatch('onTouchesUp', event([], [first]));
  };
  const pinch = () => {
    dispatch('onTouchesDown', event([first]));
    dispatch('onTouchesDown', event([first, second]));
    dispatch('onTouchesMove', event([finger('1', 50), finger('2', 250)]));
  };
  return { close, dispatch, tap, pinch, animatedStyle, manager };
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => { vi.useRealTimers(); });

it('closes on a normal tap without a preceding pinch', () => {
  const image = viewer();
  image.tap();
  expect(image.close).toHaveBeenCalledOnce();
});

it('blocks taps for one second after the last finger leaves a long pinch', () => {
  const image = viewer();
  image.pinch();
  image.dispatch('onTouchesUp', event([first], [second]));
  vi.advanceTimersByTime(2000);
  image.dispatch('onTouchesUp', event([], [first]));
  image.tap();
  expect(image.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(949);
  image.tap(); // Starting inside the cooldown stays blocked even if release is after it.
  expect(image.close).not.toHaveBeenCalled();
  image.tap();
  expect(image.close).toHaveBeenCalledOnce();
});

it('protects against a fresh tap after a cancelled pinch', () => {
  const image = viewer();
  image.pinch();
  vi.advanceTimersByTime(2000);
  image.dispatch('onTouchesCancelled', event([]));
  image.tap();
  expect(image.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  image.tap();
  expect(image.close).toHaveBeenCalledOnce();
});

it('renews protection when another pinch starts during the cooldown', () => {
  const image = viewer();
  image.pinch();
  image.dispatch('onTouchesUp', event([], [first, second]));
  vi.advanceTimersByTime(900);
  image.dispatch('onTouchesDown', event([first, second]));
  image.dispatch('onTouchesUp', event([], [first, second]));
  vi.advanceTimersByTime(100);
  image.tap();
  expect(image.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(850);
  image.tap();
  expect(image.close).toHaveBeenCalledOnce();
});

it('updates pinch and pan styles without React state or a JavaScript callback', () => {
  const image = viewer();
  image.pinch();
  expect(image.animatedStyle.transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 2 }]);
  image.dispatch('onTouchesUp', event([finger('1', 50), finger('2', 250)], [finger('2', 250)]));
  expect(image.manager.end).not.toHaveBeenCalled();
  image.dispatch('onTouchesMove', event([finger('1', 80)]));
  expect(image.animatedStyle.transform).toEqual([{ translateX: 30 }, { translateY: 0 }, { scale: 2 }]);
  image.dispatch('onTouchesUp', event([finger('1', 80)], [finger('1', 80)]));
  expect(image.manager.end).toHaveBeenCalledOnce();
  expect(runOnJS).not.toHaveBeenCalled();
});
