import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHistoryContinuation } from '../../../../shared/chat/useHistoryContinuation';
import type { HistoryLoadResult } from '../../../../shared/remote-chat/client/historyLoad';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], slot: 0,
  effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock('react', () => ({
  useRef: <T>(current: T) => {
    const slot = hooks.slot++;
    if (!(slot in hooks.values)) hooks.values[slot] = { current };
    return hooks.values[slot];
  },
  useEffect: (effect: () => (() => void) | void, dependencies: unknown[]) => {
    const slot = hooks.slot++;
    const previous = hooks.values[slot] as unknown[] | undefined;
    if (previous && dependencies.every((value, index) => Object.is(value, previous[index]))) return;
    hooks.values[slot] = dependencies;
    hooks.effects.push(() => {
      hooks.cleanups[slot]?.();
      hooks.cleanups[slot] = effect() ?? (() => {});
    });
  },
}));

const frames = new Map<number, FrameRequestCallback>();
let sequence = 0;
const loadOlder = vi.fn();
const nearTop = vi.fn(() => true);
type Options = Parameters<typeof useHistoryContinuation>[0];
let options: Options;
const result = (count: number): HistoryLoadResult => ({
  threadId: 'chat', count, completedAt: ++sequence, durationMs: 100,
});
function render(update: Partial<Options> = {}) {
  options = { ...options, ...update };
  hooks.slot = 0;
  const start = useHistoryContinuation(options);
  hooks.effects.splice(0).forEach(effect => effect());
  return start;
}
function frame() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
}

beforeEach(() => {
  hooks.values = []; hooks.slot = 0; hooks.effects = []; hooks.cleanups = [];
  frames.clear(); sequence = 0; loadOlder.mockReset(); nearTop.mockReset().mockReturnValue(true);
  options = { threadId: 'chat', loading: false, hasMore: true, loadOlder, nearTop };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback); return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup?.()); vi.unstubAllGlobals(); });

it('continues collapsed pages only after a reader starts loading and the updated layout settles', () => {
  const start = render({ result: result(10) });
  frame(); frame();
  expect(loadOlder).not.toHaveBeenCalled();
  start();
  render({ loading: true, result: undefined });
  render({ loading: false, result: result(10) });
  frame();
  expect(loadOlder).not.toHaveBeenCalled();
  frame();
  expect(loadOlder).toHaveBeenCalledOnce();
  render({ loading: true, result: undefined });
  render({ loading: false, result: result(10) });
  frame(); frame();
  expect(loadOlder).toHaveBeenCalledTimes(2);
});

it('checks the final viewport and stops when prepended content or scrolling moves it away from the top', () => {
  render()();
  render({ result: result(10) });
  frame();
  nearTop.mockReturnValue(false);
  frame();
  expect(loadOlder).not.toHaveBeenCalled();
  render({ nearTop: () => true });
  frame(); frame();
  expect(loadOlder).not.toHaveBeenCalled();
});

it.each(['failed', 'empty', 'finished', 'loading', 'other-thread'] as const)(
  'does not automatically retry a %s page', (scenario) => {
    render()();
    render({ result: scenario === 'failed' ? undefined : result(scenario === 'empty' ? 0 : 10),
      loading: scenario === 'loading', hasMore: scenario !== 'finished',
      threadId: scenario === 'other-thread' ? 'other' : 'chat' });
    frame(); frame();
    expect(loadOlder).not.toHaveBeenCalled();
  },
);

it('cancels a pending continuation on unmount or conversation switch', () => {
  render()();
  render({ result: result(10) });
  frame();
  render({ threadId: 'other' });
  frame();
  expect(loadOlder).not.toHaveBeenCalled();
  render({ threadId: 'chat' })();
  render({ result: result(10) });
  hooks.cleanups.forEach(cleanup => cleanup?.());
  frame(); frame();
  expect(loadOlder).not.toHaveBeenCalled();
});
