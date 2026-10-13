import { describe, expect, it } from 'vitest';
import { mergeHistory } from '../../../../shared/remote-chat/client/history';
import { syncChatProcessing } from '../../../../shared/remote-chat/client/processing';
import { initialChatState, type Thread } from '../../../../shared/remote-chat/client/types';

const waiting: Thread = { id: 'chat', cwd: '', preview: '', updatedAt: 1,
  turns: [{ id: 'interrupted', status: 'inProgress', items: [
    { id: 'wait', type: 'sleep', status: 'inProgress', durationMs: 20_000 },
  ] }] };
const finished: Thread = { ...waiting, status: { type: 'notLoaded' }, turns: [
  { id: 'continued', status: 'completed', items: [
    { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: '测试成功' },
  ] },
] };

describe('remote completion recovery', () => {
  it.each(['idle', 'notLoaded'])('removes an obsolete running turn when the PC reports %s', type => {
    const snapshot = { ...finished, status: { type } };
    const selected = mergeHistory(snapshot, waiting, waiting);
    expect(selected.turns).toEqual(snapshot.turns);
    const state = syncChatProcessing({ ...initialChatState(), selected }, initialChatState());
    expect(state.processing).toBeUndefined();
    expect(mergeHistory(snapshot, selected, selected).turns).toEqual(snapshot.turns);
  });

  it('preserves a new turn that starts while a completed history read is in flight', () => {
    const live = { ...waiting, turns: [...waiting.turns!,
      { id: 'new', status: 'inProgress', items: [] }] };
    const selected = mergeHistory(finished, live, waiting);
    expect(selected.turns?.map(turn => turn.id)).toEqual(['continued', 'new']);
    expect(syncChatProcessing({ ...initialChatState(), selected }, initialChatState()).processing?.turnId).toBe('new');
  });

  it.each(['active', 'unknown', undefined])('preserves running output without a settled PC status (%s)', type => {
    const snapshot = { ...finished, status: type ? { type } : undefined };
    expect(mergeHistory(snapshot, waiting, waiting).turns?.at(-1)).toMatchObject(waiting.turns![0]);
  });

  it('does not treat a snapshot with a running turn as settled', () => {
    const snapshot = { ...finished, turns: [...finished.turns!, { id: 'new', status: 'inProgress', items: [] }] };
    expect(mergeHistory(snapshot, waiting, waiting).turns?.some(turn => turn.id === 'interrupted')).toBe(true);
  });

  it('does not retire running turns from metadata without loaded history', () => {
    const snapshot = { ...finished, turns: undefined };
    expect(mergeHistory(snapshot, waiting, waiting).turns?.[0]).toMatchObject(waiting.turns![0]);
  });
});
