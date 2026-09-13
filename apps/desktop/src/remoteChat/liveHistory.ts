import type { GuiEvent, Thread } from '../pages/codexGui/types';
import { updateThread } from '../../../../shared/remote-chat/client/events';
import { mergeHistory } from '../../../../shared/remote-chat/client/history';

const MAX_LIVE_THREADS = 16;

/** app-server history can lag behind its notifications until a turn is written to disk. */
export class LiveHistory {
  private readonly threads = new Map<string, Thread>();

  receive(event: GuiEvent) {
    if (['connection/closed', 'codex/disconnected'].includes(event.method)) {
      this.threads.clear();
      return;
    }
    const id = event.params.threadId ?? event.params.thread?.id;
    if (!id || event.id != null) return;
    if (['thread/started', 'thread/resumed', 'thread/archived', 'thread/unarchived', 'thread/deleted',
      'thread/compacted'].includes(event.method)) {
      const tokenUsage = this.threads.get(id)?.tokenUsage;
      this.threads.delete(id);
      if (tokenUsage && event.method !== 'thread/deleted') {
        this.threads.set(id, { id, preview: '', cwd: '', updatedAt: 0, turns: [], tokenUsage });
      }
      return;
    }
    if (!event.params.turnId && !event.params.turn?.id && !event.params.tokenUsage) return;
    const previous = this.threads.get(id);
    const thread = previous && event.method !== 'turn/started'
      ? previous : { id, preview: '', cwd: '', updatedAt: 0, turns: [], tokenUsage: previous?.tokenUsage };
    this.threads.delete(id);
    this.threads.set(id, updateThread(thread, event));
    if (this.threads.size > MAX_LIVE_THREADS) this.threads.delete(this.threads.keys().next().value!);
  }

  merge(snapshot: Thread) {
    const live = this.threads.get(snapshot.id);
    return live ? mergeHistory(snapshot, live, { ...snapshot, turns: [], tokenUsage: undefined }) : snapshot;
  }
}
