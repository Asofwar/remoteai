import { expect, it } from 'vitest';
import { isNearHistoryStart, shouldShowScrollToBottom } from '../../../../shared/chat/scrollPosition';

it.each([
  { contentHeight: 2_000, viewportHeight: 500, offset: 1_399, visible: true },
  { contentHeight: 2_000, viewportHeight: 500, offset: 1_400, visible: false },
  { contentHeight: 2_000, viewportHeight: 500, offset: 1_500, visible: false },
  { contentHeight: 2_000, viewportHeight: 500, offset: 1_520, visible: false },
  { contentHeight: 400, viewportHeight: 500, offset: 0, visible: false },
  { contentHeight: 500, viewportHeight: 500, offset: -200, visible: false },
  { contentHeight: 2_000, viewportHeight: 0, offset: 0, visible: false },
])('calculates bottom shortcut visibility for $contentHeight/$viewportHeight/$offset', ({ visible, ...position }) => {
  expect(shouldShowScrollToBottom(position)).toBe(visible);
});

it.each([
  { viewportHeight: 720, offset: 361, near: false },
  { viewportHeight: 720, offset: 360, near: true },
  { viewportHeight: 400, offset: 201, near: false },
  { viewportHeight: 400, offset: 200, near: true },
  { viewportHeight: 100, offset: 100, near: true },
  { viewportHeight: 720, offset: -20, near: true },
  { viewportHeight: 0, offset: 0, near: false },
])('prefetches before the history edge for $viewportHeight/$offset', ({ near, ...position }) => {
  expect(isNearHistoryStart(position)).toBe(near);
});
