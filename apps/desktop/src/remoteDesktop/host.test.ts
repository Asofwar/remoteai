import { beforeEach, expect, it, vi } from 'vitest';
import { RemoteDesktopHost } from './host';
import { HostSession as DesktopHostSession } from './hostSession';
import { DEFAULT_SETTINGS, type DesktopSettings } from '../../../../shared/remote-desktop/protocol';

vi.mock('./hostSession', () => ({ HostSession: vi.fn(class {
  constructor(private settings: DesktopSettings) {}
  closed = false;
  open = vi.fn(async () => ({ sdp: 'offer', iceServers: [],
    displayId: this.settings.displayId ?? 'first', capabilities: { displaySessions: true } }));
  signal = vi.fn(async () => ({ candidates: [] }));
  update = vi.fn();
  privacy = vi.fn(async (enabled: boolean) => ({ privacyScreen: enabled, displayId: 'private' }));
  resolution = vi.fn(async () => ({ displayId: 'selected' }));
  close = vi.fn(() => { this.closed = true; });
}) }));
beforeEach(() => vi.clearAllMocks());
const opening = { action: 'open', id: 'desktop-1', settings: DEFAULT_SETTINGS };

it('validates resolution dimensions and binds changes to the authenticated owner', async () => {
  const host = new RemoteDesktopHost(); host.register('alice', []); host.register('bob', []);
  await host.request(opening, 'alice');
  const change = { action: 'resolution', id: 'desktop-1', resolution: { width: 1920, height: 1080 } };
  await expect(host.request(change, 'bob')).rejects.toThrow('连接已结束');
  for (const resolution of [null, {}, { width: '1920', height: 1080 }, { width: 0, height: 1080 },
    { width: 1920, height: 8193 }, { width: 1920.5, height: 1080 }]) {
    await expect(host.request({ ...change, resolution }, 'alice')).rejects.toThrow('有效的分辨率');
  }
  const session = vi.mocked(DesktopHostSession).mock.results[0].value;
  expect(session.resolution).not.toHaveBeenCalled();
  await expect(host.request(change, 'alice')).resolves.toMatchObject({ displayId: 'selected' });
  expect(session.resolution).toHaveBeenCalledWith(change.resolution); host.release();
});

it('privacy is explicit, owner-bound and requires a boolean switch', async () => {
  const host = new RemoteDesktopHost();
  host.register('alice', []); host.register('bob', []);
  await host.request(opening, 'alice');
  const session = vi.mocked(DesktopHostSession).mock.results[0].value;
  expect(session.privacy).not.toHaveBeenCalled();
  const change = { action: 'privacy', id: 'desktop-1', enabled: true };
  await expect(host.request(change, 'bob')).rejects.toThrow('连接已结束');
  await expect(host.request({ ...change, id: 'wrong' }, 'alice')).rejects.toThrow('连接已结束');
  await expect(host.request({ ...change, enabled: 'true' }, 'alice')).rejects.toThrow('无效');
  expect(session.privacy).not.toHaveBeenCalled();
  await expect(host.request(change, 'alice')).resolves.toMatchObject({ privacyScreen: true });
  expect(session.close).not.toHaveBeenCalled();
  host.release();
});

it('requires a registered chat session and derives ICE servers from its authenticated configuration', async () => {
  const host = new RemoteDesktopHost();
  await expect(host.request(opening, 'unknown')).rejects.toThrow('连接电脑');
  host.register('alice', [{ urls: 'stun:example.test' }]);
  await host.request({ ...opening, owner: 'forged', iceServers: [{ urls: 'stun:forged.test' }] }, 'alice');
  expect(DesktopHostSession).toHaveBeenCalledWith(
    { ...DEFAULT_SETTINGS, captureGroup: expect.any(String) }, [{ urls: 'stun:example.test' }], undefined, undefined);
});
it('isolates controls between sessions and releases media when its owner disconnects', async () => {
  const host = new RemoteDesktopHost();
  host.register('alice', []); host.register('bob', []);
  await host.request(opening, 'alice');
  await expect(host.request({ action: 'settings', id: 'desktop-1', settings: DEFAULT_SETTINGS }, 'bob'))
    .rejects.toThrow('连接已结束');
  await expect(host.request(opening, 'bob')).rejects.toThrow('已有');
  host.release('bob');
  expect(vi.mocked(DesktopHostSession).mock.results[0].value.closed).toBe(false);
  host.release('alice');
  expect(vi.mocked(DesktopHostSession).mock.results[0].value.closed).toBe(true);
});
it('closes an in-flight capture when the chat session expires', async () => {
  const host = new RemoteDesktopHost(); host.register('alice', []);
  const openingTask = host.request(opening, 'alice');
  host.release();
  await expect(openingTask).rejects.toThrow('已结束');
  expect(vi.mocked(DesktopHostSession).mock.results[0].value.closed).toBe(true);
  await expect(host.request({ action: 'signal', id: 'desktop-1', candidates: [] }, 'alice'))
    .rejects.toThrow('连接电脑');
});

it('releases an expired session and its native adapter before replacing it', async () => {
  const host = new RemoteDesktopHost(); host.register('alice', []);
  await host.request(opening, 'alice');
  const expired = vi.mocked(DesktopHostSession).mock.results[0].value;
  expired.closed = true;
  await host.request({ ...opening, id: 'desktop-2' }, 'alice');
  expect(expired.close).toHaveBeenCalledOnce();
  host.release();
});

it('retains only explicitly opened displays and keeps the native group host-owned', async () => {
  const host = new RemoteDesktopHost(); host.register('alice', []); host.register('bob', []);
  await host.request({ ...opening, settings: { ...DEFAULT_SETTINGS, captureGroup: 'forged' } }, 'alice');
  const initial = vi.mocked(DesktopHostSession).mock.calls[0][0];
  const next = { action: 'open', id: 'desktop-2',
    settings: { ...DEFAULT_SETTINGS, displayId: 'second', retainedSession: 'desktop-1', captureGroup: 'forged' } };
  await expect(host.request(next, 'bob')).rejects.toThrow('已有');
  await expect(host.request({ ...next, settings: { ...next.settings, retainedSession: 'missing' } }, 'alice'))
    .rejects.toThrow('已有');
  expect(DesktopHostSession).toHaveBeenCalledTimes(1);
  await host.request(next, 'alice');
  const sessions = vi.mocked(DesktopHostSession).mock.results.map(result => result.value);
  expect(sessions[0].closed).toBe(false);
  const following = vi.mocked(DesktopHostSession).mock.calls[1][0];
  expect(following.captureGroup).toBe(initial.captureGroup); expect(initial.captureGroup).not.toBe('forged');
  await expect(host.request({ ...next, id: 'desktop-3' }, 'alice')).rejects.toThrow('已有');
  await host.request({ action: 'settings', id: 'desktop-1', settings: { ...DEFAULT_SETTINGS, fps: 1 } }, 'alice');
  expect(sessions[0].update).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, fps: 1 });
  expect(sessions[1].update).not.toHaveBeenCalled();
  host.release('alice');
  expect(sessions.every(session => session.closed)).toBe(true);
});

it('keeps sibling captures alive on close and releases them before privacy changes', async () => {
  const host = new RemoteDesktopHost(); host.register('alice', []);
  await host.request(opening, 'alice');
  const openDisplay = (id: string, displayId: string, retainedSession: string) =>
    host.request({ action: 'open', id, settings: { ...DEFAULT_SETTINGS, displayId, retainedSession } }, 'alice');
  await openDisplay('desktop-2', 'second', 'desktop-1');
  const first = vi.mocked(DesktopHostSession).mock.results[0].value;
  const second = vi.mocked(DesktopHostSession).mock.results[1].value;
  await host.request({ action: 'close', id: 'desktop-1' }, 'alice');
  expect(first.closed).toBe(true); expect(second.closed).toBe(false);
  await openDisplay('desktop-3', 'first', 'desktop-2');
  const third = vi.mocked(DesktopHostSession).mock.results[2].value;
  await host.request({ action: 'privacy', id: 'desktop-2', enabled: true }, 'alice');
  expect(third.closed).toBe(true); expect(second.closed).toBe(false);
  expect(third.close.mock.invocationCallOrder[0]).toBeLessThan(second.privacy.mock.invocationCallOrder[0]);
  host.release();
});
