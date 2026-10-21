import { beforeEach, expect, it, vi } from 'vitest';
import type { AppRelease } from './appUpdate';

const native = vi.hoisted(() => ({
  stored: null as string | null, getItem: vi.fn(), setItem: vi.fn(), deleteItem: vi.fn(),
  official: vi.fn(), cancel: vi.fn(), path: vi.fn(), verify: vi.fn(), snapshot: vi.fn(),
  listen: vi.fn(), remove: vi.fn(), modules: {} as Record<string, unknown>,
}));
vi.mock('expo-application', () => ({ nativeApplicationVersion: '2.0.10', nativeBuildVersion: '20001099' }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: native.getItem, setItemAsync: native.setItem, deleteItemAsync: native.deleteItem,
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: native.modules,
  DeviceEventEmitter: { addListener: native.listen } }));
vi.mock('./androidUpdateNotifications', () => ({ prepareUpdateNotifications: vi.fn(),
  updateNotificationLabels: () => ({}) }));
vi.mock('../api/client', () => ({ loadSession: vi.fn().mockResolvedValue(null) }));
vi.mock('react-native-blob-util', () => ({ default: { fs: { dirs: { DownloadDir: '/downloads' } } } }));

const stored = { version: '2.0.12', path: '/downloads/CodexSwitch-update-2.0.12-123.apk', expectedSize: 100 };
const release: AppRelease = { version: stored.version, title: 'Remote AI', tagName: 'v2.0.12', notes: '',
  publishedAt: null, releaseUrl: 'https://example.test/release',
  androidAsset: { name: 'android.apk', downloadUrl: 'https://example.test/android.apk', size: 100 } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  native.stored = JSON.stringify(stored);
  native.getItem.mockImplementation(async () => native.stored);
  native.setItem.mockImplementation(async (_key: string, value: string) => { native.stored = value; });
  native.deleteItem.mockImplementation(async () => { native.stored = null; });
  native.path.mockResolvedValue(stored.path);
  native.official.mockResolvedValue(stored.path);
  native.cancel.mockResolvedValue(true);
  native.verify.mockResolvedValue(true);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 40, totalBytes: 100 });
  native.listen.mockReturnValue({ remove: native.remove });
  native.modules.AppUpdate = { updatePath: native.path, downloadOfficial: native.official,
    cancelDownload: native.cancel, verifyPackage: native.verify, getDownloadSnapshot: native.snapshot };
});

it('cancels a restored system download, remembers the choice across restarts, and permits a manual retry', async () => {
  let update = await import('./appUpdate');
  await update.refreshAndroidUpdateDownloadState();
  await update.cancelAndroidUpdateDownload();
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(stored.path);
  expect(update.getAndroidUpdateDownloadState()).toEqual({ status: 'cancelled', version: stored.version });
  vi.resetModules();
  native.snapshot.mockClear();
  update = await import('./appUpdate');
  expect(await update.refreshAndroidUpdateDownloadState()).toEqual({ status: 'cancelled', version: stored.version });
  expect(native.snapshot).not.toHaveBeenCalled();
  await expect(update.startAndroidUpdateDownload(release, { wifiOnly: true })).rejects.toThrow('cancelled');
  expect(native.official).not.toHaveBeenCalled();
  await expect(update.installDownloadedAndroidUpdate(stored.path)).rejects.toThrow();
  await update.startAndroidUpdateDownload(release);
  expect(update.getAndroidUpdateDownloadState().status).toBe('downloaded');
  expect(JSON.parse(native.stored!).cancelled).toBeUndefined();
});

it('shares cancellation, ignores late progress and completion, and waits before permitting a new attempt', async () => {
  const transfer = deferred<string>();
  const stop = deferred<boolean>();
  native.official.mockReturnValueOnce(transfer.promise);
  native.cancel.mockReturnValue(stop.promise);
  const update = await import('./appUpdate');
  const result = update.startAndroidUpdateDownload(release).catch(error => error as Error);
  await vi.waitFor(() => expect(native.official).toHaveBeenCalledOnce());
  const cancel = update.cancelAndroidUpdateDownload();
  expect(update.cancelAndroidUpdateDownload()).toBe(cancel);
  const again = update.startAndroidUpdateDownload(release);
  const event = native.listen.mock.calls.find(([name]) => name === 'appUpdateDownloadProgress')![1];
  event({ path: stored.path, receivedBytes: 90, totalBytes: 100, bytesPerSecond: 10, phase: 'downloading' });
  expect(update.getAndroidUpdateDownloadState()).toMatchObject({ status: 'downloading', cancelling: true });
  transfer.resolve(stored.path);
  await vi.waitFor(() => expect(native.cancel).toHaveBeenCalledOnce());
  expect(native.verify).not.toHaveBeenCalled();
  stop.resolve(true);
  await cancel;
  expect(await result).toBeInstanceOf(Error);
  await again;
  expect(native.official).toHaveBeenCalledTimes(2);
  expect(update.getAndroidUpdateDownloadState().status).toBe('downloaded');
});

it('cancels during preparation without starting the native transfer', async () => {
  const path = deferred<string>();
  native.path.mockReturnValue(path.promise);
  const update = await import('./appUpdate');
  const result = update.startAndroidUpdateDownload(release).catch(error => error as Error);
  await vi.waitFor(() => expect(native.path).toHaveBeenCalledOnce());
  const cancel = update.cancelAndroidUpdateDownload();
  path.resolve(stored.path);
  await cancel;
  expect(await result).toBeInstanceOf(Error);
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith(stored.path);
  expect(native.official).not.toHaveBeenCalled();
  expect(update.getAndroidUpdateDownloadState().status).toBe('cancelled');
});

it('does not start an official fallback when peer cancellation settles as a transport failure', async () => {
  const peer = deferred<string>();
  const peers = vi.fn().mockReturnValue(peer.promise);
  native.modules.AppUpdate = { ...native.modules.AppUpdate as object,
    artifactId: vi.fn().mockResolvedValue('b'.repeat(64)), downloadPeers: peers };
  native.cancel.mockImplementation(async () => { peer.reject(new Error('transfer stopped')); return true; });
  const update = await import('./appUpdate');
  const signed = { ...release, androidAsset: { ...release.androidAsset!, sha256: 'a'.repeat(64) } };
  const result = update.startAndroidUpdateDownload(signed).catch(error => error as Error);
  await vi.waitFor(() => expect(peers).toHaveBeenCalledOnce());
  await update.cancelAndroidUpdateDownload();
  expect(await result).toBeInstanceOf(Error);
  expect(native.official).not.toHaveBeenCalled();
  expect(update.getAndroidUpdateDownloadState().status).toBe('cancelled');
});

it('allows cancellation while the downloaded package is being verified', async () => {
  const verification = deferred<boolean>();
  native.verify.mockReturnValue(verification.promise);
  const update = await import('./appUpdate');
  const result = update.startAndroidUpdateDownload(release).catch(error => error as Error);
  await vi.waitFor(() => expect(native.verify).toHaveBeenCalledOnce());
  const cancel = update.cancelAndroidUpdateDownload();
  verification.resolve(false);
  await cancel;
  expect(await result).toBeInstanceOf(Error);
  expect(update.getAndroidUpdateDownloadState().status).toBe('cancelled');
  expect(native.deleteItem).not.toHaveBeenCalled();
});

it('keeps the live download usable when cancellation fails', async () => {
  const transfer = deferred<string>();
  native.official.mockReturnValue(transfer.promise);
  native.cancel.mockRejectedValue(new Error('system temporarily unavailable'));
  const update = await import('./appUpdate');
  const download = update.startAndroidUpdateDownload(release);
  await vi.waitFor(() => expect(native.official).toHaveBeenCalledOnce());
  await expect(update.cancelAndroidUpdateDownload()).rejects.toThrow('system temporarily unavailable');
  expect(update.getAndroidUpdateDownloadState()).toMatchObject({ status: 'downloading', cancelling: false });
  expect(JSON.parse(native.stored!).cancelled).toBeUndefined();
  transfer.resolve(stored.path);
  await download;
  expect(update.getAndroidUpdateDownloadState().status).toBe('downloaded');
});
