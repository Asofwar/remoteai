import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { imageOrientation, type ImageOrientation } from './imageOrientation';

const SAMPLE_INTERVAL_MS = 200;
const STABLE_SAMPLES = 3;
const LOCKS = {
  portrait: ScreenOrientation.OrientationLock.PORTRAIT_UP,
  'portrait-down': ScreenOrientation.OrientationLock.PORTRAIT_DOWN,
  'landscape-left': ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
  'landscape-right': ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
} satisfies Record<ImageOrientation, ScreenOrientation.OrientationLock>;
const DISPLAYED_ORIENTATIONS: Partial<Record<ScreenOrientation.Orientation, ImageOrientation>> = {
  [ScreenOrientation.Orientation.PORTRAIT_UP]: 'portrait',
  [ScreenOrientation.Orientation.PORTRAIT_DOWN]: 'portrait-down',
  [ScreenOrientation.Orientation.LANDSCAPE_LEFT]: 'landscape-left',
  [ScreenOrientation.Orientation.LANDSCAPE_RIGHT]: 'landscape-right',
};

export function useImageOrientation() {
  const [displayed, setDisplayed] = useState<ImageOrientation>('portrait');
  const [device, setDevice] = useState<ImageOrientation | null>(null);
  const [error, setError] = useState('');
  const [rotating, setRotating] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const pending = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    const update = (value: ScreenOrientation.Orientation) => {
      const orientation = DISPLAYED_ORIENTATIONS[value];
      if (active && orientation) setDisplayed(orientation);
    };
    const subscription = ScreenOrientation.addOrientationChangeListener(event => {
      update(event.orientationInfo.orientation);
    });
    void ScreenOrientation.getOrientationAsync().then(update)
      .catch(() => console.warn('Unable to read preview orientation'));
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let subscription: ReturnType<typeof Accelerometer.addListener> | undefined;
    let candidate: ImageOrientation | null = null;
    let samples = 0;
    void Accelerometer.isAvailableAsync().then((available) => {
      if (!active || !available) return;
      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      subscription = Accelerometer.addListener((gravity) => {
        const next = imageOrientation(gravity, Platform.OS);
        samples = next === candidate ? samples + 1 : 1;
        candidate = next;
        if (samples >= STABLE_SAMPLES) setDevice(next);
      });
    }).catch(() => { if (active) setError(t("暂时无法识别手机方向")); });
    return () => {
      active = false;
      mounted.current = false;
      subscription?.remove();
      // Finish any requested rotation before allowing the chat to follow the device again.
      void pending.current.then(() => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT))
        .catch(() => console.warn('Unable to restore automatic orientation'));
    };
  }, []);

  const rotate = () => {
    if (!device || device === displayed || busy.current) return;
    const target = device;
    busy.current = true;
    setRotating(true);
    setError('');
    pending.current = (async () => {
      try {
        if (!await ScreenOrientation.supportsOrientationLockAsync(LOCKS[target])) {
          if (mounted.current) setError(t("此方向暂不支持，请换个方向试试"));
          return;
        }
        if (!mounted.current) return;
        await ScreenOrientation.lockAsync(LOCKS[target]);
        if (mounted.current) setDisplayed(target);
      } catch {
        if (mounted.current) setError(t("旋转失败，请重试"));
      } finally {
        busy.current = false;
        if (mounted.current) setRotating(false);
      }
    })();
  };
  return { suggested: device !== null && device !== displayed, rotate, rotating, error, displayed };
}
