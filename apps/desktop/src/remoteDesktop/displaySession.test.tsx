// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDesktopSession } from '../../../../shared/remote-desktop/useDesktopSession';
import type { DesktopCapabilities, DesktopClient, DesktopDisplays, DesktopResolution, DesktopSettings }
  from '../../../../shared/remote-desktop/protocol';
import type { DesktopDirectRetry } from '../../../../shared/remote-desktop/directRetry';

interface FakeSession {
  options: { stream: (stream?: MediaStream) => void; displays: (value: DesktopDisplays) => void;
    capabilities: (value: DesktopCapabilities) => void;
    failed: (message: string) => void; status: (value: string) => void; directRetry: DesktopDirectRetry };
  start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; input: ReturnType<typeof vi.fn>;
  settings: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; sessionId: string;
  privacy: ReturnType<typeof vi.fn>;
  resolution: ReturnType<typeof vi.fn<(size: DesktopResolution) => Promise<void>>>;
}
const runtime = vi.hoisted(() => ({
  sessions: [] as FakeSession[], multiDisplay: false, openFailure: '',
}));
vi.mock('../../../../shared/remote-desktop/receiver', () => ({ DesktopReceiver: class {
  sessionId = `desktop-${runtime.sessions.length}`;
  start = vi.fn(async (settings: DesktopSettings) => {
    if (runtime.openFailure) { this.options.failed(runtime.openFailure); return; }
    this.options.displays({ displays: [], displayId: runtime.multiDisplay ? settings.displayId : 'first' });
    if (runtime.multiDisplay) this.options.capabilities({ displaySessions: true, control: true, privacyScreen: true });
    this.options.stream({} as MediaStream);
  });
  stop = vi.fn(async () => { this.options.stream(undefined); });
  input = vi.fn(); settings = vi.fn(); mute = vi.fn();
  privacy = vi.fn(async (enabled: boolean) => {
    this.options.displays({ displayId: enabled ? 'private' : 'first', privacyScreen: enabled });
  });
  resolution = vi.fn(async (size: DesktopResolution) => {
    this.options.displays({ displayId: 'first', resolutions: [size],
      displays: [{ id: 'first', name: 'DISPLAY1', primary: true, ...size }] });
  });
  constructor(public options: FakeSession['options']) { runtime.sessions.push(this); }
} }));
const client: DesktopClient = { open: vi.fn(), signal: vi.fn(), settings: vi.fn(), close: vi.fn() };
const createPeer = vi.fn();
let root: Root;
let session: ReturnType<typeof useDesktopSession>;
function Harness({ active = true, connected = true }) {
  session = useDesktopSession({ client, active, connected, createPeer }); return null;
}
beforeEach(async () => {
  runtime.sessions.length = 0; runtime.multiDisplay = false; runtime.openFailure = '';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('uses host resolutions, prevents overlapping changes and refreshes display dimensions', async () => {
  const current = runtime.sessions[0];
  const size = { width: 1920, height: 1080 };
  await act(async () => current.options.displays({ displayId: 'first', resolutions: [size] }));
  await act(async () => session.resolution.change(size));
  expect(current.resolution).not.toHaveBeenCalled();
  await act(async () => current.options.capabilities({ control: true, resolution: true, privacyScreen: true }));
  expect(session.resolution.options).toEqual([size]);
  let finish!: () => void;
  const original = current.resolution.getMockImplementation()!;
  current.resolution.mockImplementationOnce(async value => {
    await new Promise<void>(resolve => { finish = resolve; }); await original(value);
  });
  let pending!: Promise<void>;
  await act(async () => { pending = session.resolution.change(size); });
  expect(session.saving).toBe(true);
  await act(async () => { await session.resolution.change(size); await session.togglePrivacy(); });
  expect(current.resolution).toHaveBeenCalledOnce(); expect(current.privacy).not.toHaveBeenCalled();
  await act(async () => { finish(); await pending; });
  expect(session.displays[0]).toMatchObject(size); expect(session.saving).toBe(false);
  expect(current.stop).not.toHaveBeenCalled(); expect(session.status).toBe('');
});

it('only toggles privacy with control capability, keeps the session and resets on reconnect', async () => {
  const first = runtime.sessions[0];
  expect(session.privacyScreen).toBe(false);
  await act(async () => session.togglePrivacy());
  expect(first.privacy).not.toHaveBeenCalled();
  await act(async () => first.options.capabilities({ control: false, privacyScreen: true }));
  await act(async () => session.togglePrivacy());
  expect(first.privacy).not.toHaveBeenCalled();
  await act(async () => first.options.capabilities({ control: true, privacyScreen: true }));
  await act(async () => session.togglePrivacy());
  expect(session.privacyScreen).toBe(true); expect(session.settings.displayId).toBe('private');
  expect(first.stop).not.toHaveBeenCalled(); expect(runtime.sessions).toHaveLength(1);
  await act(async () => session.update({ ...session.settings, displayId: 'physical' }));
  expect(first.stop).not.toHaveBeenCalled();
  await act(async () => session.togglePrivacy());
  expect(session.privacyScreen).toBe(false); expect(session.settings.displayId).toBe('first');
  await act(async () => session.togglePrivacy());
  await act(async () => session.retry());
  expect(session.privacyScreen).toBe(false);
  expect(runtime.sessions[1].privacy).not.toHaveBeenCalled();
});

it('leaves privacy off after a rejected toggle and releases the saving state', async () => {
  const first = runtime.sessions[0];
  first.privacy.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => first.options.capabilities({ control: true, privacyScreen: true }));
  await act(async () => session.togglePrivacy());
  expect(session.privacyScreen).toBe(false); expect(session.saving).toBe(false);
  expect(session.status).toBe('unavailable'); expect(first.stop).not.toHaveBeenCalled();
});

it('keeps the ordinary desktop while setup awaits a local decision and allows retry after installation', async () => {
  const current = runtime.sessions[0];
  const message = '请在电脑上确认安装，完成后再点一次隐私屏。';
  current.privacy.mockRejectedValueOnce(new Error(message));
  await act(async () => current.options.capabilities({ control: true, privacyScreen: true }));
  await act(async () => session.togglePrivacy());
  expect(session.status).toBe(message);
  expect(session.privacyScreen).toBe(false);
  expect(session.saving).toBe(false);
  expect(session.stream).toBeDefined();
  expect(current.stop).not.toHaveBeenCalled();
  await act(async () => session.togglePrivacy());
  expect(session.privacyScreen).toBe(true);
  expect(session.status).toBe('');
  expect(runtime.sessions).toHaveLength(1);
});

it('keeps direct backoff across automatic reconnects and resets it after the viewer closes', async () => {
  vi.useFakeTimers();
  const first = runtime.sessions[0]; first.options.directRetry.failed();
  await act(async () => {
    first.options.failed('Connection lost'); await vi.advanceTimersByTimeAsync(1000);
  });
  expect(runtime.sessions).toHaveLength(2);
  expect(runtime.sessions[1].options.directRetry).toBe(first.options.directRetry);
  expect(runtime.sessions[1].options.directRetry.delay).toBe(15_000);
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => root.render(<Harness />));
  expect(runtime.sessions[2].options.directRetry).not.toBe(first.options.directRetry);
  expect(runtime.sessions[2].options.directRetry.delay).toBe(5000);
});

it('releases dragging and waits for close before reconnecting with the chosen screen', async () => {
  const old = runtime.sessions[0];
  let release!: () => void;
  const closed = new Promise<void>(resolve => { release = resolve; });
  old.stop.mockImplementation(() => closed);
  act(() => session.pointer.button('left', true));
  const next: DesktopSettings = { fps: 90, quality: 'clear', displayId: 'second' };
  let switching!: Promise<void>;
  await act(async () => { switching = session.update(next); });
  expect(old.input).toHaveBeenLastCalledWith({ kind: 'button', button: 'left', down: false });
  expect(session.saving).toBe(true); expect(runtime.sessions).toHaveLength(1);
  await act(async () => session.update({ ...next, displayId: 'third' }));
  expect(old.stop).toHaveBeenCalledOnce();
  await act(async () => { release(); await switching; });
  expect(runtime.sessions).toHaveLength(2);
  expect(runtime.sessions[1].start).toHaveBeenCalledWith(next);
  // The host may fall back to its primary display if the requested screen was removed.
  expect(session.settings.displayId).toBe('first');
});

it('does not reopen a screen when the viewer closes during a pending switch', async () => {
  let release!: () => void;
  runtime.sessions[0].stop.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  let switching!: Promise<void>;
  await act(async () => { switching = session.update({ ...session.settings, displayId: 'second' }); });
  const finishSwitch = release;
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => { finishSwitch(); await switching; release(); });
  expect(runtime.sessions).toHaveLength(1);
});

it('preserves healthy media during a signaling outage and waits for the host after media fails', async () => {
  vi.useFakeTimers();
  const first = runtime.sessions[0];
  await act(async () => root.render(<Harness connected={false} />));
  expect(first.stop).not.toHaveBeenCalled(); expect(session.stream).toBeDefined();
  await act(async () => {
    first.options.stream(undefined); first.options.failed('offline');
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(runtime.sessions).toHaveLength(1);
  expect(session.status).toBe('远程电脑已断开，恢复在线后将自动重连。');
  await act(async () => session.retry());
  expect(runtime.sessions).toHaveLength(1);
  await act(async () => root.render(<Harness />));
  expect(first.stop).toHaveBeenCalledOnce();
  expect(runtime.sessions).toHaveLength(2); expect(session.stream).toBeDefined();
});

it('cancels pending offline recovery when the viewer closes', async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<Harness connected={false} />));
  await act(async () => runtime.sessions[0].options.failed('offline'));
  await act(async () => root.render(<Harness active={false} connected={false} />));
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => { session.retry(); await vi.runAllTimersAsync(); });
  expect(runtime.sessions).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
});

async function enableDisplaySessions() {
  runtime.multiDisplay = true;
  await act(async () => runtime.sessions[0].options.capabilities({
    displaySessions: true, control: true, privacyScreen: true,
  }));
}

it('opens only visited displays, parks the previous one at 1 FPS and reuses it on return', async () => {
  await enableDisplaySessions();
  const first = runtime.sessions[0];
  expect(runtime.sessions).toHaveLength(1);
  act(() => session.pointer.button('left', true));
  await act(async () => session.update({ fps: 90, quality: 'clear', displayId: 'second' }));
  const second = runtime.sessions[1];
  expect(first.input).toHaveBeenLastCalledWith({ kind: 'button', button: 'left', down: false });
  expect(first.settings).toHaveBeenLastCalledWith({ fps: 1, quality: 'auto', displayId: 'first' });
  expect(first.stop).not.toHaveBeenCalled();
  expect(second.start).toHaveBeenCalledWith({
    fps: 90, quality: 'clear', displayId: 'second', retainedSession: first.sessionId,
  });
  expect(first.mute).toHaveBeenLastCalledWith(true);
  expect(second.mute).toHaveBeenLastCalledWith(false);
  await act(async () => session.update({ ...session.settings, displayId: 'first' }));
  expect(runtime.sessions).toHaveLength(2);
  expect(first.start).toHaveBeenCalledOnce();
  expect(first.settings).toHaveBeenLastCalledWith({ fps: 90, quality: 'clear', displayId: 'first' });
  expect(second.settings).toHaveBeenLastCalledWith({ fps: 1, quality: 'clear', displayId: 'second' });
  expect(second.stop).not.toHaveBeenCalled();
  expect(session.settings).toEqual({ fps: 90, quality: 'clear', displayId: 'first' });
  act(() => session.input({ kind: 'key', key: 'desktop' }));
  expect(first.input).toHaveBeenLastCalledWith({ kind: 'key', key: 'desktop' });
  expect(second.input).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness active={false} />));
  expect(first.stop).toHaveBeenCalledOnce(); expect(second.stop).toHaveBeenCalledOnce();
});

it('ignores background media callbacks and closes backgrounds before enabling privacy', async () => {
  await enableDisplaySessions();
  const first = runtime.sessions[0];
  await act(async () => session.update({ ...session.settings, displayId: 'second' }));
  const stream = session.stream;
  await act(async () => {
    first.options.stream(undefined);
    first.options.displays({ displayId: 'first' });
    first.options.status('background status');
  });
  expect(session.stream).toBe(stream); expect(session.settings.displayId).toBe('second');
  expect(session.status).not.toBe('background status');
  await act(async () => session.togglePrivacy());
  expect(first.stop).toHaveBeenCalledOnce();
  expect(runtime.sessions[1].privacy).toHaveBeenCalledWith(true);
  expect(runtime.sessions[1].stop).not.toHaveBeenCalled();
});

it('restores the current display after a failed new display and can retry', async () => {
  await enableDisplaySessions();
  const first = runtime.sessions[0];
  // A failed settings RPC must not open a second capture or change the selected screen.
  first.settings.mockRejectedValueOnce(new Error('settings unavailable'));
  await act(async () => session.update({ ...session.settings, displayId: 'second' }));
  expect(runtime.sessions).toHaveLength(1); expect(session.settings.displayId).toBe('first');
  expect(session.saving).toBe(false);
  await act(async () => session.update({ ...session.settings, displayId: 'second' }));
  expect(runtime.sessions).toHaveLength(2); expect(session.settings.displayId).toBe('second');
});

it('restores foreground quality after a rejected capture without dropping the existing connection', async () => {
  await enableDisplaySessions();
  const first = runtime.sessions[0];
  runtime.openFailure = '显示器已断开，请重新连接桌面。';
  await act(async () => session.update({ fps: 90, quality: 'clear', displayId: 'removed' }));
  expect(runtime.sessions).toHaveLength(2); expect(session.settings.displayId).toBe('first');
  expect(first.settings).toHaveBeenLastCalledWith({ fps: 'auto', quality: 'auto', displayId: 'first' });
  expect(first.stop).not.toHaveBeenCalled(); expect(session.saving).toBe(false);
  expect(session.status).toBe(runtime.openFailure);
  runtime.openFailure = '';
  await act(async () => session.update({ ...session.settings, displayId: 'second' }));
  expect(runtime.sessions).toHaveLength(3); expect(session.settings.displayId).toBe('second');
});

it('does not let a failed background interrupt the foreground and opens it again on the next visit', async () => {
  await enableDisplaySessions();
  const first = runtime.sessions[0];
  await act(async () => session.update({ ...session.settings, displayId: 'second' }));
  const stream = session.stream;
  await act(async () => first.options.failed('removed display'));
  expect(first.stop).toHaveBeenCalledOnce();
  expect(session.stream).toBe(stream); expect(session.settings.displayId).toBe('second');
  await act(async () => session.update({ ...session.settings, displayId: 'first' }));
  expect(runtime.sessions).toHaveLength(3);
  expect(runtime.sessions[2].start).toHaveBeenCalledWith(expect.objectContaining({ displayId: 'first' }));
});

it('cancels an in-flight switch without opening unvisited screens after closing', async () => {
  await enableDisplaySessions();
  let release!: () => void;
  runtime.sessions[0].settings.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = session.update({ ...session.settings, displayId: 'second' }); });
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => { release(); await pending; });
  expect(runtime.sessions).toHaveLength(1); expect(session.saving).toBe(false);
});
