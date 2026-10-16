import { beforeEach, expect, it, vi } from 'vitest';
import { useRetainedChatDevices } from '../../../../shared/remote-chat/useRetainedChatDevices';

const hooks = vi.hoisted(() => ({ state: undefined as unknown }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    hooks.state ??= initial;
    return [hooks.state, (value: unknown) => { hooks.state = value; }];
  },
}));

const computer = { deviceId: 'computer', name: 'Computer', online: true };
const laptop = { deviceId: 'laptop', name: 'Laptop', online: true };
const devices = [computer, laptop];
const render = (options: Partial<Parameters<typeof useRetainedChatDevices<typeof computer>>[0]> = {}) =>
  useRetainedChatDevices({ scope: 'account', devices, selectedId: computer.deviceId, ...options });

beforeEach(() => { hooks.state = undefined; });

it('connects only visited devices and retains their order when switching back', () => {
  expect(render()).toEqual([computer]);
  expect(render({ selectedId: laptop.deviceId })).toEqual([computer, laptop]);
  expect(render()).toEqual([computer, laptop]);
  expect(render({ selectedId: laptop.deviceId })).toEqual([computer, laptop]);
});

it('keeps offline connections and updates names and presence without replacing their device keys', () => {
  render();
  render({ selectedId: laptop.deviceId });
  const updated = { ...computer, name: 'Renamed', online: false };
  expect(render({ devices: [laptop, updated] })).toEqual([updated, laptop]);
});

it('releases removed devices and never retains a missing notification target', () => {
  render();
  render({ selectedId: laptop.deviceId });
  expect(render({ devices: [laptop], selectedId: 'missing' })).toEqual([laptop]);
  expect(render({ selectedId: laptop.deviceId })).toEqual([laptop]);
  expect(render({ devices: [], selectedId: undefined })).toEqual([]);
});

it('releases every retained device when the account or server changes', () => {
  render();
  render({ selectedId: laptop.deviceId });
  expect(render({ scope: 'other-account' })).toEqual([computer]);
  expect(render({ scope: 'other-server', selectedId: undefined })).toEqual([]);
});

it('preserves existing sessions while no device is selected', () => {
  expect(render({ selectedId: undefined })).toEqual([]);
  render();
  expect(render({ selectedId: undefined })).toEqual([computer]);
});
