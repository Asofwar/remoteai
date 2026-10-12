import { beforeEach, expect, it, vi } from 'vitest';
import { subscribeAndroidDownloadProgress, updateDownloadPercent } from './androidDownloadProgress';

const events = vi.hoisted(() => ({ listen: vi.fn(), remove: vi.fn() }));
vi.mock('react-native', () => ({ DeviceEventEmitter: { addListener: events.listen } }));
beforeEach(() => { vi.resetAllMocks(); events.listen.mockReturnValue({ remove: events.remove }); });

it('ignores stale paths and malformed counters and releases its listener', () => {
  const changed = vi.fn();
  const stop = subscribeAndroidDownloadProgress('/update.apk', changed);
  const receive = events.listen.mock.calls[0][1];
  const valid = { path: '/update.apk', receivedBytes: 20, totalBytes: 100, bytesPerSecond: 10, phase: 'downloading' };
  for (const value of [null, {}, { ...valid, path: '/old.apk' }, { ...valid, receivedBytes: NaN },
    { ...valid, totalBytes: -1 }, { ...valid, bytesPerSecond: '10' }, { ...valid, phase: 'unknown' }]) receive(value);
  expect(changed).not.toHaveBeenCalled();
  receive(valid);
  expect(changed).toHaveBeenCalledWith({ receivedBytes: 20, totalBytes: 100, bytesPerSecond: 10, phase: 'downloading' });
  stop();
  expect(events.remove).toHaveBeenCalledOnce();
});

it('uses an unknown percentage without a total and never rounds up before all bytes arrive', () => {
  const progress = { receivedBytes: 999, totalBytes: 1000, bytesPerSecond: 10, phase: 'downloading' } as const;
  expect(updateDownloadPercent(progress)).toBe(99);
  expect(updateDownloadPercent({ ...progress, totalBytes: 0 })).toBeNull();
  expect(updateDownloadPercent(undefined)).toBeNull();
  expect(updateDownloadPercent({ ...progress, receivedBytes: 1001 })).toBe(100);
});
