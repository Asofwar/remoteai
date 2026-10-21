import { beforeEach, expect, it, vi } from 'vitest';
import { beginAppUpdateDownload } from './updateActions';
import { AndroidUpdateCancelled } from './androidUpdateAttempt';
import type { AppRelease } from './appUpdate';

const state = vi.hoisted(() => ({ start: vi.fn(), success: vi.fn(), fail: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openURL: vi.fn() } }));
vi.mock('../components/AppToast', () => ({ Toast: { success: state.success, fail: state.fail } }));
vi.mock('./appUpdate', () => ({ startAndroidUpdateDownload: state.start }));
const release = { version: '2.0.12', androidAsset: { name: 'android.apk' } } as AppRelease;

beforeEach(() => vi.resetAllMocks());

it('does not show a download failure toast for a user cancellation', async () => {
  state.start.mockRejectedValue(new AndroidUpdateCancelled());
  beginAppUpdateDownload(release);
  await Promise.resolve();
  expect(state.fail).not.toHaveBeenCalled();
});

it('still shows a friendly error for an actual download failure', async () => {
  state.start.mockRejectedValue(new Error('network unavailable'));
  beginAppUpdateDownload(release);
  await Promise.resolve();
  expect(state.fail).toHaveBeenCalledExactlyOnceWith('下载失败，请稍后重试');
});
