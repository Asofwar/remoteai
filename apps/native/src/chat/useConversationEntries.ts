import { useMemo, useState } from 'react';
import { conversationEntries } from './turnPresentation';
import type { Turn } from './types';

/** Match desktop details: work seen running stays open until the conversation is left. */
export function retainInlineTurns(turns: Turn[], previous: ReadonlySet<string>): ReadonlySet<string> {
  const added = turns.filter((turn) => turn.status === 'inProgress' && !previous.has(turn.id));
  return added.length ? new Set([...previous, ...added.map((turn) => turn.id)]) : previous;
}

// ChatMessages is keyed by conversation, so this state never carries into another conversation.
export function useConversationEntries(turns: Turn[]) {
  const [inlineTurns, setInlineTurns] = useState<ReadonlySet<string>>(() => new Set());
  const retained = retainInlineTurns(turns, inlineTurns);
  if (retained !== inlineTurns) setInlineTurns(retained);
  const entries = useMemo(() => conversationEntries(turns, retained), [turns, retained]);
  return { entries, hasObservedLiveTurn: retained.size > 0 };
}
