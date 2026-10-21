import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('react-native', () => ({ NativeModules: { AppUpdate: { getDownloadSnapshot: native.snapshot } } }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => { vi.useRealTimers(); });

it('keeps paused progress visible, then measures speed once the same download resumes', async () => {
  const { getAndroidDownloadSnapshot } = await import('./androidDownloadStatus');
  native.snapshot.mockResolvedValue({ status: 'paused', receivedBytes: 40, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({
    status: 'paused', progress: { receivedBytes: 40, totalBytes: 100, bytesPerSecond: 0 },
  });
  vi.setSystemTime(100_000);
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({
    status: 'paused', progress: { receivedBytes: 40, totalBytes: 100, bytesPerSecond: 0 },
  });
  vi.setSystemTime(105_000);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 90, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({
    status: 'running', progress: { receivedBytes: 90, bytesPerSecond: 10 },
  });
});

it('does not invent a percentage when neither the system nor the release knows the total', async () => {
  const { getAndroidDownloadSnapshot } = await import('./androidDownloadStatus');
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 40, totalBytes: 0 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 0)).toMatchObject({
    progress: { receivedBytes: 40, totalBytes: 0, bytesPerSecond: 0 },
  });
});

it('keeps a stable speed when multiple views refresh within the same second', async () => {
  const { getAndroidDownloadSnapshot } = await import('./androidDownloadStatus');
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 40, totalBytes: 100 });
  await getAndroidDownloadSnapshot('/update.apk', 100);
  vi.setSystemTime(15_000);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 70, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({ progress: { bytesPerSecond: 6 } });
  vi.setSystemTime(15_010);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 71, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({
    progress: { receivedBytes: 71, bytesPerSecond: 6 },
  });
  vi.setSystemTime(20_000);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 90, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/update.apk', 100)).toMatchObject({ progress: { bytesPerSecond: 4 } });
});

it('does not reuse samples across destinations or show negative speed after a system retry', async () => {
  const { getAndroidDownloadSnapshot } = await import('./androidDownloadStatus');
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 40, totalBytes: 100 });
  await getAndroidDownloadSnapshot('/first.apk', 100);
  vi.setSystemTime(15_000);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 80, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/second.apk', 100)).toMatchObject({
    progress: { receivedBytes: 80, bytesPerSecond: 0 },
  });
  vi.setSystemTime(20_000);
  native.snapshot.mockResolvedValue({ status: 'running', receivedBytes: 10, totalBytes: 100 });
  expect(await getAndroidDownloadSnapshot('/second.apk', 100)).toMatchObject({
    progress: { receivedBytes: 10, bytesPerSecond: 0 },
  });
});
