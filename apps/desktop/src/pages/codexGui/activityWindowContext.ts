import { createContext, type RefObject } from 'react';

export type ActivityDirection = 'older' | 'newer';
export type ActivityPager = (direction: ActivityDirection) => boolean;

export interface ActivityWindowControl {
  viewport: RefObject<HTMLDivElement>;
  following: boolean;
  register: (pager: ActivityPager) => () => void;
  load: (update: () => void, anchor?: Element) => boolean;
}

export const ActivityWindowContext = createContext<ActivityWindowControl | null>(null);
