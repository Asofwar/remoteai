// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopInputFocus } from '../../../../shared/remote-desktop/protocol';
import { desktopInputFocus } from '../../../../shared/remote-desktop/inputFocus';
import { useDesktopInputFocus } from '../../../../shared/remote-desktop/useDesktopInputFocus';

let root: Root;
let value: DesktopInputFocus | null;
const detected = { top: 0.7, bottom: 0.72, lineHeight: 0.02 };
const read = vi.fn<() => Promise<DesktopInputFocus | null>>();
function Viewer({ active = true, displayId = 'first' }) {
  value = useDesktopInputFocus({ active, read, displayId });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  read.mockReset(); read.mockResolvedValue(detected);
  root = createRoot(document.createElement('div'));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('does not overlap requests and discards results from a previous display', async () => {
  let finish!: (value: DesktopInputFocus) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<Viewer />));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Viewer displayId="second" />));
  await act(async () => finish(detected));
  expect(value).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(value).toEqual(detected);
  await act(async () => root.render(<Viewer active={false} />));
  expect(value).toBeNull();
  const count = read.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(read).toHaveBeenCalledTimes(count);
});

it('falls back to mouse positioning when the host cannot read the focused input', async () => {
  await act(async () => root.render(<Viewer />));
  expect(value).toEqual(detected);
  read.mockRejectedValue(new Error('provider unavailable'));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(value).toBeNull();
});

it('rejects malformed or off-display geometry', () => {
  for (const invalid of [undefined, {}, { top: -1, bottom: 0.5 }, { top: 0.7, bottom: Infinity },
    { top: 0.7, bottom: 0.6 }, { ...detected, lineHeight: 0 }, { ...detected, lineHeight: NaN }]) {
    expect(desktopInputFocus(invalid)).toBeNull();
  }
  expect(desktopInputFocus(detected)).toEqual(detected);
});
