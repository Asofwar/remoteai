import { expect, it } from 'vitest';
import { completedTurnFiles, conversationEntries, findWorkEntry, groupTurnItems } from './turnPresentation';
import type { Item, Turn } from './types';
import { CONTINUE_MESSAGE } from '../../../../shared/remote-chat/composerAction';

it('keeps user steering and final replies in order while grouping process messages', () => {
  const items: Item[] = [
    { id: 'user', type: 'userMessage' },
    { id: 'thinking', type: 'reasoning' },
    { id: 'update', type: 'agentMessage', phase: 'commentary' },
    { id: 'command', type: 'commandExecution' },
    { id: 'steer', type: 'userMessage' },
    { id: 'edit', type: 'fileChange' },
    { id: 'final', type: 'agentMessage', phase: 'final_answer' },
  ];
  expect(groupTurnItems(items).map((group) => [group.type, group.items.map((item) => item.id)])).toEqual([
    ['message', ['user']], ['work', ['thinking', 'update', 'command']], ['message', ['steer']],
    ['work', ['edit']], ['message', ['final']],
  ]);
  expect(groupTurnItems([{ id: 'legacy', type: 'agentMessage' }])[0].type).toBe('message');
});

it('keeps a live process drawer address stable as output arrives and a final answer follows', () => {
  const turn: Turn = { id: 'turn', status: 'inProgress', items: [
    { id: 'progress', type: 'agentMessage', phase: 'commentary', text: 'Working' },
  ] };
  const entry = conversationEntries([turn])[0];
  const updated = conversationEntries([{ ...turn, items: [...turn.items,
    { id: 'shell', type: 'commandExecution' }, { id: 'answer', type: 'agentMessage', phase: 'final_answer' },
  ] }]);
  expect(updated[0].id).toBe(entry.id);
  expect(updated.map((value) => value.kind)).toEqual(['work', 'message']);
});

it('retains every turn plan, failure, interruption and changes instead of only the latest turn', () => {
  const turns: Turn[] = [
    { id: 'plan', status: 'completed', items: [], plan: [{ step: 'Verify', status: 'completed' }] },
    { id: 'failure', status: 'failed', items: [], error: { message: 'Request failed' } },
    { id: 'stop', status: 'interrupted', items: [] },
    { id: 'continue', status: 'inProgress', items: [
      { id: 'auto', type: 'userMessage', content: [{ type: 'text', text: CONTINUE_MESSAGE }] },
      { id: 'answer', type: 'agentMessage', text: 'Continued' },
    ] },
  ];
  expect(conversationEntries(turns).map((entry) => [entry.turn.id, entry.kind])).toEqual([
    ['plan', 'summary'], ['failure', 'summary'], ['stop', 'summary'], ['continue', 'message'],
  ]);
});

it('excludes failed and unfinished patches and prefers final net changes', () => {
  const turn: Turn = { id: 'turn', status: 'completed', items: ['completed', 'failed', 'declined', 'inProgress']
    .map((status) => ({ id: status, type: 'fileChange', status,
      changes: [{ path: `${status}.ts`, kind: { type: 'add' }, diff: 'one\n' }] })) };
  expect(completedTurnFiles(turn).map((file) => file.path)).toEqual(['completed.ts']);
  expect(completedTurnFiles({ ...turn, diff: '--- a/net.ts\n+++ b/net.ts\n@@ -1 +1 @@\n-old\n+new\n' }))
    .toMatchObject([{ path: 'net.ts', added: 1, removed: 1 }]);
});

it('places the completed duration before the response without adding empty summary cells', () => {
  const turn: Turn = { id: 'turn', status: 'completed', durationMs: 2500, items: [
    { id: 'question', type: 'userMessage' }, { id: 'answer', type: 'agentMessage', text: 'Done' },
  ] };
  expect(conversationEntries([turn]).map((entry) => entry.kind)).toEqual(['message', 'duration', 'message']);
  expect(conversationEntries([{ ...turn, status: 'inProgress', durationMs: undefined }])
    .map((entry) => entry.kind)).toEqual(['message', 'message']);
});

it('keeps the open process group addressable after loading an earlier page of the same turn', () => {
  const turn: Turn = { id: 'turn', status: 'completed', items: [{ id: 'tail', type: 'commandExecution' }] };
  const selectedId = conversationEntries([turn])[0].id;
  const entries = conversationEntries([{ ...turn, items: [{ id: 'earlier', type: 'reasoning' }, ...turn.items] }]);
  expect(findWorkEntry(entries, selectedId)?.items.map((item) => item.id)).toEqual(['earlier', 'tail']);
  expect(findWorkEntry(entries, 'another-turn:work:tail')).toBeUndefined();
});
