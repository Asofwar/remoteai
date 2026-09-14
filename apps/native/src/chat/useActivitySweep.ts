import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';

const SWEEP_DURATION_MS = 2400;

/** Native-driver transforms keep the sweep independent of streaming and list rendering. */
export function useActivitySweep(active: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    }).catch(() => { /* Keep the static label if the accessibility setting cannot be read. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const enabled = active && foreground && !reducedMotion;
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: SWEEP_DURATION_MS, easing: Easing.inOut(Easing.ease),
      // An endless interaction would prevent FlatList from rendering further activity cells.
      useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [enabled, progress]);
  return { progress, enabled };
}
