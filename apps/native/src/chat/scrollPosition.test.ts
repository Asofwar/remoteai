import { expect, it } from 'vitest';
import { shouldShowScrollToBottom } from '../../../../shared/chat/scrollPosition';

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
