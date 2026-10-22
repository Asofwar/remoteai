import { useLayoutEffect, useRef, useState } from 'react';
import type { DocumentTab } from './documents';

const EDGE_TOLERANCE = 1;
interface OverflowState { overflowing: boolean; hiddenPaths: string[]; clippedLeft: boolean }

function revealTab(viewport: HTMLDivElement, path?: string) {
  const active = [...viewport.querySelectorAll<HTMLElement>('.pf-tab')]
    .find(tab => path ? tab.dataset.path === path : tab.dataset.active === 'true');
  if (!active || !viewport.clientWidth) return;
  const bounds = viewport.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  if (tab.left < bounds.left) viewport.scrollLeft += tab.left - bounds.left;
  else if (tab.right > bounds.right) viewport.scrollLeft += tab.right - bounds.right;
}

function measureOverflow(bar: HTMLDivElement, viewport: HTMLDivElement): OverflowState {
  const tabs = [...viewport.querySelectorAll<HTMLElement>('.pf-tab')];
  const bounds = viewport.getBoundingClientRect();
  const totalWidth = tabs.reduce((width, tab) => width + tab.getBoundingClientRect().width, 0);
  // Include the menu button's space so it disappears as soon as the tabs can fit without it.
  const overflowing = totalWidth > bar.clientWidth + EDGE_TOLERANCE;
  const hiddenPaths = overflowing ? tabs.flatMap(tab => {
    const rect = tab.getBoundingClientRect();
    const clipped = rect.left < bounds.left - EDGE_TOLERANCE || rect.right > bounds.right + EDGE_TOLERANCE;
    return clipped && tab.dataset.path ? [tab.dataset.path] : [];
  }) : [];
  return { overflowing, hiddenPaths, clippedLeft: overflowing && viewport.scrollLeft > EDGE_TOLERANCE };
}

export function useTabOverflow(tabs: DocumentTab[], activePath?: string) {
  const bar = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OverflowState>({ overflowing: false, hiddenPaths: [], clippedLeft: false });
  const paths = JSON.stringify(tabs.map(tab => tab.path));
  useLayoutEffect(() => {
    const container = bar.current, strip = viewport.current;
    if (!container || !strip) return;
    const measure = () => {
      const next = measureOverflow(container, strip);
      setState(previous => previous.overflowing === next.overflowing && previous.clippedLeft === next.clippedLeft
        && JSON.stringify(previous.hiddenPaths) === JSON.stringify(next.hiddenPaths) ? previous : next);
    };
    const resize = () => { revealTab(strip); measure(); };
    resize();
    const observer = new ResizeObserver(resize);
    [container, strip, ...strip.children].forEach(element => observer.observe(element));
    strip.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); strip.removeEventListener('scroll', measure); };
  }, [paths, activePath]);
  const reveal = (path: string) => { if (viewport.current) revealTab(viewport.current, path); };
  return { bar, viewport, reveal, ...state };
}
