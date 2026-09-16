import { beforeEach, expect, it, vi } from 'vitest';
import { useAppUpdate } from './useAppUpdate';

const observed = vi.hoisted(() => ({
  effects: [] as Array<() => void>, updates: [] as unknown[], check: vi.fn(), download: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, (value: unknown) => observed.updates.push(value)],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => observed.effects.push(effect),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openURL: vi.fn() } }));
vi.mock('../components/AppToast', () => ({ Toast: { success: vi.fn(), fail: vi.fn() } }));
vi.mock('../update/useAndroidUpdateDownloadState', () => ({
  useAndroidUpdateDownloadState: () => ({ status: 'idle' }),
}));
vi.mock('../update/appUpdate', () => ({
  checkForAppUpdate: observed.check, startAndroidUpdateDownload: observed.download,
  installDownloadedAndroidUpdate: vi.fn(),
}));

beforeEach(() => {
  observed.effects = [];
  observed.updates = [];
  observed.check.mockReset();
  observed.download.mockReset();
});

it('checks automatically on each visit without starting a download', async () => {
  const result = { updateAvailable: true, release: { version: '1.6.0' } };
  observed.check.mockResolvedValue(result);
  useAppUpdate();
  observed.effects[0]?.();
  await vi.waitFor(() => expect(observed.updates).toContain(result));
  useAppUpdate();
  observed.effects[1]?.();
  expect(observed.check).toHaveBeenCalledTimes(2);
  expect(observed.download).not.toHaveBeenCalled();
});

it('ignores repeat checks during a request and allows retry after a failure', async () => {
  let reject: (error: Error) => void = () => undefined;
  observed.check.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
    .mockResolvedValue({ updateAvailable: false });
  const update = useAppUpdate();
  const pending = update.checkForUpdate();
  await update.checkForUpdate();
  expect(observed.check).toHaveBeenCalledTimes(1);
  reject(new Error('network unavailable'));
  await pending;
  expect(observed.updates).toContain('暂时无法检查更新，请重试。');
  expect(observed.updates.at(-1)).toBe(false);
  await update.checkForUpdate();
  expect(observed.check).toHaveBeenCalledTimes(2);
});
