import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { VersionUpdateButton } from './VersionUpdateButton';
import type { useAppUpdate } from './useAppUpdate';

vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native', () => ({ ActivityIndicator: 'Spinner', Pressable: 'Button', Text: 'Text' }));
vi.mock('./styles', () => ({ useStyles: () => ({}) }));
vi.mock('../settings/styles', () => ({ useStyles: () => ({}) }));

afterEach(() => vi.unstubAllGlobals());

it.each(['failed', 'cancelled'])('provides an enabled retry action for a %s update download', status => {
  vi.stubGlobal('React', React);
  const beginDownload = vi.fn();
  const release = { version: '1.5.31' };
  const update = {
    downloadState: { status, version: release.version, message: '下载未完成，请重新下载。' },
    updateCheck: { updateAvailable: true, release }, checking: false, error: '', beginDownload,
  } as unknown as ReturnType<typeof useAppUpdate>;
  const button = VersionUpdateButton({ update });
  expect(button.props.accessibilityLabel).toBe('重新下载');
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  expect(beginDownload).toHaveBeenCalledWith(release);
});

it.each(['downloading', 'verifying'] as const)('prioritizes %s over a latest-version result', phase => {
  vi.stubGlobal('React', React);
  const update = { checking: false, error: '', updateCheck: { updateAvailable: false },
    downloadState: { status: 'downloading', version: '2.0.0', progress: {
      receivedBytes: 40, totalBytes: 100, bytesPerSecond: 20, phase,
    } } } as ReturnType<typeof useAppUpdate>;
  const button = VersionUpdateButton({ update });
  expect(button.props.accessibilityLabel).toBe(phase === 'verifying' ? '正在校验' : '下载中 · 40%');
  expect(button.props.disabled).toBe(true);
});

vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'),

  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
