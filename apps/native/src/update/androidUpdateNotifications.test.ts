import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ state: { currentState: 'active' }, channel: vi.fn(),
  permission: vi.fn(), request: vi.fn() }));
vi.mock('react-native', () => ({ AppState: mock.state }));
vi.mock('expo-notifications', () => ({ setNotificationChannelAsync: mock.channel,
  getPermissionsAsync: mock.permission, requestPermissionsAsync: mock.request, AndroidImportance: { LOW: 2 } }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); mock.state.currentState = 'active';
  mock.permission.mockResolvedValue({ granted: false, canAskAgain: true });
});

it('creates a quiet update channel before requesting Android notification access, at most once', async () => {
  const { prepareUpdateNotifications } = await import('./androidUpdateNotifications');
  await prepareUpdateNotifications();
  await prepareUpdateNotifications();
  expect(mock.channel).toHaveBeenCalledWith('app-update-download', {
    name: '应用更新', importance: 2, showBadge: false, sound: null,
  });
  expect(mock.request).toHaveBeenCalledOnce();
  expect(mock.channel.mock.invocationCallOrder[0]).toBeLessThan(mock.request.mock.invocationCallOrder[0]);
});

it.each(['background', 'granted', 'denied'])('does not ask for notification permission when %s', async reason => {
  if (reason === 'background') mock.state.currentState = 'background';
  if (reason === 'granted') mock.permission.mockResolvedValue({ granted: true, canAskAgain: true });
  if (reason === 'denied') mock.permission.mockResolvedValue({ granted: false, canAskAgain: false });
  const { prepareUpdateNotifications } = await import('./androidUpdateNotifications');
  await prepareUpdateNotifications();
  expect(mock.request).not.toHaveBeenCalled();
});

it('continues the update when notification setup is unavailable', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mock.channel.mockRejectedValue(new Error('Unavailable'));
  const { prepareUpdateNotifications } = await import('./androidUpdateNotifications');
  await expect(prepareUpdateNotifications()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
