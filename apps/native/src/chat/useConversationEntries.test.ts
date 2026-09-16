import { beforeEach, expect, it, vi } from 'vitest';
import { useConversationEntries } from './useConversationEntries';
import type { Turn } from './types';

const state = vi.hoisted(() => ({ turns: new Map<string, boolean>() as ReadonlyMap<string, boolean>,
  observed: { current: false } }));
vi.mock('react', () => ({
  useMemo: <T>(compute: () => T) => compute(),
  useCallback: <T>(callback: T) => callback,
  useRef: () => state.observed,
  useState: () => [state.turns,
    (update: (previous: ReadonlyMap<string, boolean>) => ReadonlyMap<string, boolean>) => {
      state.turns = update(state.turns);
    }],
}));
beforeEach(() => { state.turns = new Map(); state.observed = { current: false }; });

const live: Turn = { id: 'live', status: 'inProgress', items: [
  { id: 'question', type: 'userMessage', text: 'Explain this without tools.' },
] };

it('shows a new tool-free turn while the initial native scroll position is still pending', () => {
  expect(useConversationEntries([]).hasObservedLiveTurn).toBe(false);
  const waiting = useConversationEntries([live]);
  expect(waiting.hasObservedLiveTurn).toBe(true);
  expect(waiting.entries.map((entry) => entry.kind)).toEqual(['message']);
  const replying = useConversationEntries([{ ...live, items: [...live.items,
    { id: 'answer', type: 'agentMessage', text: 'A streamed answer' },
  ] }]);
  expect(replying.hasObservedLiveTurn).toBe(true);
  expect(replying.entries.map((entry) => entry.kind)).toEqual(['message', 'message']);
});

it('does not cover a visible tool-free reply again when its turn completes', () => {
  useConversationEntries([live]);
  const completed = useConversationEntries([{ ...live, status: 'completed', items: [...live.items,
    { id: 'answer', type: 'agentMessage', text: 'Finished' },
  ] }]);
  expect(completed.hasObservedLiveTurn).toBe(true);
  expect(completed.entries.at(-1)).toMatchObject({ kind: 'message', item: { text: 'Finished' } });
});

it('still waits for the initial scroll position when reopening completed history', () => {
  const history = useConversationEntries([{ ...live, status: 'completed' }]);
  expect(history.hasObservedLiveTurn).toBe(false);
  expect(history.entries).toHaveLength(1);
});

it('keeps explicit collapse and expansion through streaming updates and completion', () => {
  const turn: Turn = { ...live, items: [...live.items, { id: 'tool', type: 'commandExecution' }] };
  useConversationEntries([turn]).setInline(turn.id, false);
  expect(useConversationEntries([turn]).entries.some((entry) => entry.kind === 'process')).toBe(false);
  useConversationEntries([turn]).setInline(turn.id, true);
  const completed = useConversationEntries([{ ...turn, status: 'completed' }]);
  expect(completed.entries.some((entry) => entry.kind === 'process')).toBe(true);
  expect(completed.hasObservedLiveTurn).toBe(true);
});
