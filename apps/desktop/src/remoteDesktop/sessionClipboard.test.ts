import { expect, it, vi } from 'vitest';
import { sessionClipboard } from '../../../../shared/remote-desktop/sessionClipboard';
import type { DesktopReceiver } from '../../../../shared/remote-desktop/receiver';

function fixture() {
  const clipboard = { copy: vi.fn().mockResolvedValue(undefined), paste: vi.fn().mockResolvedValue(undefined),
    read: vi.fn(), write: vi.fn() };
  const input = vi.fn();
  const receiver = { clipboard, input } as unknown as DesktopReceiver;
  return { clipboard, input, receiver };
}

it('uses native gestures even when clipboard sharing is disabled', async () => {
  const { receiver, clipboard } = fixture();
  const session = sessionClipboard(() => receiver, { clipboard: false, clipboardNative: true, control: true });
  await session.copy('cut'); await session.paste(true);
  expect(clipboard.copy).toHaveBeenCalledWith('cut', undefined);
  expect(clipboard.paste).toHaveBeenCalledWith(true);
  expect(() => session.write({ format: 'text', text: 'private' })).toThrow('未允许剪贴板');
});

it.each(['windows', 'macos'] as const)('keeps native shortcuts on old %s hosts without importing local data', async platform => {
  const { receiver, clipboard, input } = fixture();
  const session = sessionClipboard(() => receiver, { clipboard: true, keyboard: true, platform });
  await session.copy('copy'); await session.copy('cut'); await session.paste(true);
  const modifier = platform === 'macos' ? 'MetaLeft' : 'ControlLeft';
  expect(input.mock.calls.map(([event]) => event)).toEqual(['KeyC', 'KeyX', 'KeyV'].flatMap(code => [
    { kind: 'keyboard', code: modifier, down: true }, { kind: 'keyboard', code, down: true },
    { kind: 'keyboard', code, down: false }, { kind: 'keyboard', code: modifier, down: false },
  ]));
  expect(clipboard.copy).not.toHaveBeenCalled(); expect(clipboard.paste).not.toHaveBeenCalled();
  expect(clipboard.write).not.toHaveBeenCalled();
});
