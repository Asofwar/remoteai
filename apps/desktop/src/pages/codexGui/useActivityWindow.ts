import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityWindowContext, type ActivityDirection } from './activityWindowContext';
import { ACTIVITY_PAGE_STEP, ACTIVITY_WINDOW_SIZE,
  indexedActivityGroups, visibleActivityGroups } from './activityWindow';
import type { Item } from './types';

const LOAD_DISTANCE = 100;

function nearEdge(root: HTMLElement, viewport: HTMLElement, direction: ActivityDirection) {
  const bounds = root.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  if (bounds.bottom < view.top || bounds.top > view.bottom) return false;
  return direction === 'older' ? bounds.top >= view.top - LOAD_DISTANCE
    : bounds.bottom <= view.bottom + LOAD_DISTANCE;
}

function retainedAnchor(root: HTMLElement, viewport: HTMLElement, ids: Set<string>) {
  const top = viewport.getBoundingClientRect().top;
  const retained = [...root.querySelectorAll<HTMLElement>('[data-message-id], [data-activity-group]')]
    .filter(node => node.getClientRects().length > 0
      && ids.has(node.dataset.messageId ?? node.dataset.activityGroup ?? ''));
  return retained.find(node => node.dataset.messageId && node.getBoundingClientRect().bottom > top)
    ?? retained.find(node => node.getBoundingClientRect().bottom > top) ?? retained.at(-1);
}

/** Expanded process groups also need a bound, including a single never-ending turn. */
export function useActivityWindow(items: Item[]) {
  const control = useContext(ActivityWindowContext);
  const root = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<string>();
  const found = cursor && !control?.following ? items.findIndex(item => item.id === cursor) : -1;
  const start = found < 0 ? Math.max(0, items.length - ACTIVITY_WINDOW_SIZE) : found;
  const allGroups = useMemo(() => indexedActivityGroups(items), [items]);
  const groups = useMemo(() => visibleActivityGroups(allGroups, start), [allGroups, start]);

  useLayoutEffect(() => {
    if (control?.following) setCursor(undefined);
    else if (control && !cursor) setCursor(items[start]?.id);
  }, [control?.following, cursor, items, start]);

  useLayoutEffect(() => {
    if (!control) return;
    return control.register(direction => {
      const node = root.current;
      const viewport = control.viewport.current;
      if (!node || !viewport || !nearEdge(node, viewport, direction)) return false;
      const edge = direction === 'older' ? groups[0] : groups.at(-1);
      let next = start + (direction === 'older' ? -ACTIVITY_PAGE_STEP : ACTIVITY_PAGE_STEP);
      const disclosure = [...node.children].find(child => child.getAttribute('data-activity-group') === edge?.key)
        ?.querySelector('details');
      // A collapsed run already represents all its commands. Skip its hidden pages in one step.
      if (edge && disclosure && !disclosure.open) {
        next = direction === 'older' ? Math.min(next, edge.start - ACTIVITY_PAGE_STEP)
          : Math.max(next, edge.end - ACTIVITY_PAGE_STEP);
        if (direction === 'older' ? edge.start === 0 : edge.end === items.length) return false;
      }
      next = Math.max(0, Math.min(next, items.length - ACTIVITY_WINDOW_SIZE));
      if (next === start) return false;
      const retained = visibleActivityGroups(allGroups, next);
      const ids = new Set(retained.flatMap(group => [group.key, ...group.visible.map(item => item.id)]));
      const anchor = retainedAnchor(node, viewport, ids);
      return control.load(() => setCursor(items[next]?.id), anchor);
    });
  }, [control, allGroups, groups, items, start]);

  return { root, groups };
}
