import { groupConsecutiveActivities } from './activityGroups';
import type { Item } from './types';

export const ACTIVITY_WINDOW_SIZE = 50;
export const ACTIVITY_PAGE_STEP = ACTIVITY_WINDOW_SIZE / 2;

export function indexedActivityGroups(items: Item[]) {
  let start = 0;
  return groupConsecutiveActivities(items).map(group => {
    const first = start;
    start += group.items.length;
    return { ...group, start: first, end: start };
  });
}

export function visibleActivityGroups(groups: ReturnType<typeof indexedActivityGroups>, start: number) {
  const end = start + ACTIVITY_WINDOW_SIZE;
  return groups.filter(group => group.end > start && group.start < end).map(group => ({
    ...group, visible: group.items.slice(Math.max(0, start - group.start), end - group.start),
  }));
}
