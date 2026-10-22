// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopPointer } from '../../../../shared/remote-desktop/input';
import { cursorPosition, desktopViewport, type DesktopViewport } from '../../../../shared/remote-desktop/geometry';
import { useInputViewport } from '../../../../shared/remote-desktop/useInputViewport';
import { useMouseViewport } from '../../../../shared/remote-desktop/useMouseViewport';
import type { DesktopInputFocus } from '../../../../shared/remote-desktop/protocol';

let root: Root;
let pointer: DesktopPointer;
let viewport: DesktopViewport;
function Viewer({ height = 450, inputOpen = false, inputFocus }: {
  height?: number; inputOpen?: boolean; inputFocus?: DesktopInputFocus | null;
}) {
  const fitted = desktopViewport({ width: 900, height }, { width: 1600, height: 900 });
  const base = useInputViewport(fitted, inputOpen);
  viewport = useMouseViewport(pointer, base, undefined, { inputOpen, inputFocus });
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  pointer = new DesktopPointer(vi.fn());
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Viewer />));
});
afterEach(() => { act(() => root.unmount()); pointer.dispose(); vi.unstubAllGlobals(); });

it('scrolls only vertically to reveal the pointer row and two rows below, then restores the closed view', () => {
  const original = viewport;
  act(() => pointer.absolute(0.8, 0.8));
  act(() => root.render(<Viewer height={180} inputOpen />));
  expect(viewport.content).toMatchObject({
    x: original.content.x, width: original.content.width, height: original.content.height,
  });
  expect(cursorPosition(pointer.getSnapshot(), viewport).y).toBeCloseTo(180 - 48);
  expect(viewport.content.y).toBeLessThan(0);
  act(() => root.render(<Viewer height={140} inputOpen />));
  expect(cursorPosition(pointer.getSnapshot(), viewport).y).toBeCloseTo(140 - 48);
  act(() => root.render(<Viewer />));
  expect(viewport).toEqual(original);
});

it('leaves visible rows in place and does not pan horizontally as the pointer moves', () => {
  act(() => pointer.absolute(0.1, 0.1));
  act(() => root.render(<Viewer height={180} inputOpen />));
  expect(viewport.content.y).toBe(0);
  const x = viewport.content.x;
  act(() => pointer.absolute(1, 0.7));
  expect(viewport.content.x).toBe(x);
  expect(cursorPosition(pointer.getSnapshot(), viewport).y).toBeCloseTo(180 - 48);
  act(() => pointer.absolute(0, 0.7));
  expect(viewport.content.x).toBe(x);
});

it('reserves context even at the last desktop row and keeps it usable in a very short viewport', () => {
  act(() => pointer.absolute(1, 1));
  act(() => root.render(<Viewer height={60} inputOpen />));
  expect(cursorPosition(pointer.getSnapshot(), viewport).y).toBe(30);
  expect(viewport.content.width).toBe(800);
});

it('prefers actual input geometry and scales context to its line height instead of following the mouse', () => {
  act(() => pointer.absolute(0.1, 0.1));
  act(() => root.render(<Viewer height={180} inputOpen inputFocus={{ top: 0.78, bottom: 0.8, lineHeight: 0.02 }} />));
  expect(viewport.content.y).toBeCloseTo(180 - 450 * 0.8 - 2 * 450 * 0.02);
  act(() => pointer.absolute(0.9, 1));
  expect(viewport.content.y).toBeCloseTo(180 - 450 * 0.8 - 2 * 450 * 0.02);
  act(() => root.render(<Viewer height={180} inputOpen inputFocus={null} />));
  expect(cursorPosition(pointer.getSnapshot(), viewport).y).toBeCloseTo(180 - 48);
});
