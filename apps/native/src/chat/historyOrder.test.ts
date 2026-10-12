import { expect, it } from 'vitest';
import { mergeHistory } from '../../../../shared/remote-chat/client/history';
import { acknowledgedEvents } from '../../../../shared/chat/acknowledgedMessages';
import { updateThread } from '../../../../shared/remote-chat/client/events';
import type { Item, Thread } from './types';

const user = (id: string, localEcho = false): Item => ({ id, type: 'userMessage', localEcho,
  content: [{ type: 'text', text: id }] });
const reply = (id: string): Item => ({ id, type: 'agentMessage', phase: 'commentary', text: id });
const thread = (items: Item[], status = 'inProgress'): Thread => ({ id: 'chat', cwd: '', preview: '', updatedAt: 1,
  turns: [{ id: 'turn', status, items }] });
const ids = (value: Thread) => value.turns![0].items.map(item => item.id);

it.each(['inProgress', 'completed'])('keeps supplements between replies during a %s refresh', status => {
  const first = user('first');
  const before = reply('before');
  const after = reply('after');
  const live = thread([first, before, user('supplement', true), after], status);
  const snapshot = thread([first, before, after], status);
  const merged = mergeHistory(snapshot, live, live);
  expect(ids(merged)).toEqual(['first', 'before', 'supplement', 'after']);
  expect(ids(mergeHistory(snapshot, merged, merged))).toEqual(ids(merged));
});

it('keeps a delivered supplement in place when an older snapshot still contains its echo', () => {
  const first = user('first');
  const before = reply('before');
  const after = reply('after');
  const snapshot = thread([first, before, user('echo', true), after]);
  const live = thread([first, before, user('delivered'), after]);
  expect(ids(mergeHistory(snapshot, live, live))).toEqual(['first', 'before', 'delivered', 'after']);
});

it('adds older history without moving supplements or the streamed tail', () => {
  const first = user('first');
  const before = reply('before');
  const after = reply('after');
  const live = thread([first, before, user('one', true), user('two', true), after, reply('tail')]);
  const snapshot = thread([user('older'), first, before, after]);
  expect(ids(mergeHistory(snapshot, live, live)))
    .toEqual(['older', 'first', 'before', 'one', 'two', 'after', 'tail']);
});

it('anchors an acknowledgement replayed after later replies have already loaded', () => {
  const first = user('first');
  const before = reply('before');
  const after = reply('after');
  const desktop = thread([first, before, user('supplement', true), after]);
  const mobile = thread([first, before, after]);
  const events = acknowledgedEvents(desktop);
  expect(ids([...events, ...events].reduce(updateThread, mobile)))
    .toEqual(['first', 'before', 'supplement', 'after']);
});

it('keeps an unfinished answer before the supplement that interrupted it', () => {
  const first = user('first');
  const interrupted = { ...reply('unfinished-answer'), phase: 'final_answer' as const };
  const supplement = user('supplement');
  const latest = reply('latest-progress');
  const live = thread([first, interrupted, supplement, latest]);
  const snapshot = thread([first, supplement, latest]);
  expect(ids(mergeHistory(snapshot, live, live)))
    .toEqual(['first', 'unfinished-answer', 'supplement', 'latest-progress']);
});
