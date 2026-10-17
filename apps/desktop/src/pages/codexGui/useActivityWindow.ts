import { useMemo, useState } from 'react';
import type { Item } from './types';

export const ACTIVITY_WINDOW_SIZE = 50;
const ACTIVITY_PAGE_STEP = ACTIVITY_WINDOW_SIZE / 2;

/** Expanded process groups also need a bound, including a single never-ending turn. */
export function useActivityWindow(items: Item[]) {
  const [cursor, setCursor] = useState<string>();
  const found = cursor ? items.findIndex(item => item.id === cursor) : -1;
  const start = found < 0 ? Math.max(0, items.length - ACTIVITY_WINDOW_SIZE) : found;
  const visible = useMemo(() => items.slice(start, start + ACTIVITY_WINDOW_SIZE), [items, start]);
  const more = start + ACTIVITY_WINDOW_SIZE < items.length;
  return {
    items: visible, earlier: start > 0, later: more,
    older: () => setCursor(items[Math.max(0, start - ACTIVITY_PAGE_STEP)]?.id),
    newer: () => {
      const next = start + ACTIVITY_PAGE_STEP;
      setCursor(next + ACTIVITY_WINDOW_SIZE >= items.length ? undefined : items[next]?.id);
    },
    latest: () => setCursor(undefined),
  };
}
