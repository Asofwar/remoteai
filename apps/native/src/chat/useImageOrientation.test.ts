import { beforeEach, expect, it, vi } from 'vitest';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Accelerometer } from 'expo-sensors';
import { useImageOrientation } from './useImageOrientation';

const runtime = vi.hoisted(() => ({ effects: [] as Array<() => (() => void) | undefined>,
  states: [] as unknown[], cursor: 0, refs: [] as Array<{ current: unknown }>, refCursor: 0, remove: vi.fn() }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = runtime.cursor++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
  useRef: (current: unknown) => {
    const index = runtime.refCursor++;
    return runtime.refs[index] ??= { current };
  },
  useEffect: (effect: () => (() => void) | undefined) => runtime.effects.push(effect),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-sensors', () => ({ Accelerometer: {
  isAvailableAsync: vi.fn(async () => true), setUpdateInterval: vi.fn(),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
} }));
vi.mock('expo-screen-orientation', () => ({
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1, PORTRAIT_DOWN: 2, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  OrientationLock: { DEFAULT: 0, PORTRAIT_UP: 3, PORTRAIT_DOWN: 4, LANDSCAPE_LEFT: 6, LANDSCAPE_RIGHT: 7 },
  lockAsync: vi.fn(async () => {}), supportsOrientationLockAsync: vi.fn(async () => true),
  getOrientationAsync: vi.fn(async () => 3),
  addOrientationChangeListener: vi.fn(() => ({ remove: runtime.remove })),
}));
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function open() {
  useImageOrientation();
  const cleanups = runtime.effects.map(effect => effect());
  return () => cleanups.forEach(cleanup => cleanup?.());
}
beforeEach(() => {
  vi.clearAllMocks(); runtime.effects = []; runtime.states = []; runtime.cursor = 0;
  runtime.refs = []; runtime.refCursor = 0;
});

it('recognizes an already-landscape tablet and follows subsequent screen rotation', async () => {
  const close = open(); await flush();
  expect(runtime.states[0]).toBe('landscape-left');
  const listener = vi.mocked(ScreenOrientation.addOrientationChangeListener).mock.calls[0][0];
  listener({ orientationInfo: { orientation: ScreenOrientation.Orientation.LANDSCAPE_RIGHT },
    orientationLock: ScreenOrientation.OrientationLock.DEFAULT });
  expect(runtime.states[0]).toBe('landscape-right');
  close(); await flush();
  expect(runtime.remove).toHaveBeenCalledOnce();
  expect(ScreenOrientation.lockAsync).toHaveBeenCalledExactlyOnceWith(ScreenOrientation.OrientationLock.DEFAULT);
});

it('restores automatic orientation after closing during a requested preview rotation', async () => {
  const close = open(); await flush();
  const sensor = vi.mocked(Accelerometer.addListener).mock.calls[0][0];
  for (let index = 0; index < 3; index++) sensor({ x: 1, y: 0, z: 0, timestamp: index });
  runtime.cursor = 0;
  runtime.refCursor = 0;
  const preview = useImageOrientation();
  expect(preview.suggested).toBe(true);
  let finish!: () => void;
  vi.mocked(ScreenOrientation.lockAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  preview.rotate(); await flush();
  close(); await flush();
  finish(); await flush();
  expect(vi.mocked(ScreenOrientation.lockAsync).mock.calls.map(([lock]) => lock)).toEqual([
    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT, ScreenOrientation.OrientationLock.DEFAULT,
  ]);
});
