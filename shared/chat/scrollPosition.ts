const SCROLL_BOTTOM_VISIBLE_RATIO = 0.2;

interface ScrollPosition {
  contentHeight: number;
  viewportHeight: number;
  offset: number;
}

/** Show the shortcut only when more than one fifth of a viewport remains below the visible content. */
export function shouldShowScrollToBottom({ contentHeight, viewportHeight, offset }: ScrollPosition): boolean {
  return viewportHeight > 0 && contentHeight - viewportHeight - Math.max(0, offset)
    > viewportHeight * SCROLL_BOTTOM_VISIBLE_RATIO;
}
