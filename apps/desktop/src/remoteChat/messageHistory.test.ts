import { expect, it } from 'vitest';
import { LiveHistory } from './liveHistory';
import { historyNotification } from '../../../../shared/remote-chat/historyNotification';
import { HISTORY_CHANGED } from '../../../../shared/remote-chat/historySync';

it('invalidates host live history after deletion so snapshots cannot restore removed replies', async () => {
  const live = new LiveHistory();
  live.receive({ method: 'turn/completed', params: { threadId: 'thread',
    turn: { id: 'removed', status: 'completed', items: [{ id: 'reply', type: 'agentMessage', text: 'remove' }] } } });
  const event = { method: 'thread/historyChanged', params: { threadId: 'thread' } };
  live.receive(event);
  const thread = { id: 'thread', cwd: '', preview: '', updatedAt: 1, turns: [] };
  expect(await live.read('thread', async () => ({ thread }))).toEqual(thread);
  expect(historyNotification(event)).toEqual({ method: HISTORY_CHANGED,
    params: { threadId: 'thread', reason: 'thread/historyChanged' } });
});
