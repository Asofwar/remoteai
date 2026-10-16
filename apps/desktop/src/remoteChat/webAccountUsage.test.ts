// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { preserveLatestUsage, selectUsageDevice, usageDevice, usageUpdatedAt } from '../../../web/src/accounts/remoteUsage';
import type { AccountSummary, RemoteDevice } from '../../../web/src/types';

vi.mock('../../../web/src/api', () => ({ apiJson: vi.fn(), getActiveSession: vi.fn(),
  deviceStatusWebSocketUrl: vi.fn() }));

function device(deviceId: string, online = true): RemoteDevice {
  return { deviceId, online, name: deviceId, platform: 'Windows', lastSeenAt: '',
    localProxyRunning: false, capabilities: ['account-usage'] };
}

function account(fetchedAt?: string, remaining = 80): AccountSummary {
  return { id: 'account', email: 'account@example.test', plan: 'pro', note: '', expiresAt: '', active: false,
    usage: { fetchedAt, primary: { usedPercent: 100 - remaining, remainingPercent: remaining } } };
}

it('prefers the online chat selection and otherwise uses the first online list entry', () => {
  const devices = [device('offline', false), device('first'), device('selected')];
  expect(selectUsageDevice(devices, 'selected')?.deviceId).toBe('selected');
  for (const selection of [null, 'offline', 'removed']) {
    expect(selectUsageDevice(devices, selection)?.deviceId).toBe('first');
  }
  devices[2].online = false;
  expect(selectUsageDevice(devices, 'selected')?.deviceId).toBe('first');
});

it('reports offline or unsupported targets without switching away from an online selection', () => {
  expect(() => usageDevice([device('offline', false)], null)).toThrow('暂无在线电脑');
  const old = { ...device('old'), capabilities: [] };
  expect(() => usageDevice([device('first'), old], 'old')).toThrow('请先更新电脑');
});

it('keeps the newer direct PC usage while accepting cloud metadata and later cloud usage', () => {
  const current = account('2026-10-17T10:00:00Z', 42);
  const cloud = { ...account('2026-10-17T09:00:00Z'), note: 'new note' };
  expect(preserveLatestUsage([cloud], [current])[0]).toMatchObject({ note: 'new note', usage: current.usage });
  expect(preserveLatestUsage([account()], [current])[0].usage).toEqual(current.usage);
  const newer = account('2026-10-17T11:00:00Z', 30);
  expect(preserveLatestUsage([newer], [current])[0]).toEqual(newer);
});

it('derives the update time from confirmed usage and ignores unavailable timestamps', () => {
  expect(usageUpdatedAt([account(), account('invalid')])).toBeNull();
  expect(usageUpdatedAt([account(), account('2026-10-17T10:00:00Z')]))
    .toBe(Date.parse('2026-10-17T10:00:00Z'));
});
