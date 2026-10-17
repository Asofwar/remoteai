import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import type { ChatConnection, ConnectionEvents } from '../../../../shared/remote-chat/client/connection';
import { historyLoadResult } from '../../../../shared/remote-chat/client/historyLoad';
import type { OfflineHistoryStore } from '../../../../shared/remote-chat/client/offline';
import { sliceHistory, type HistoryWindow } from '../../../../shared/remote-chat/historyPage';
import { historyDelta, type HistoryVersion } from '../../../../shared/remote-chat/historySync';
import type { Thread } from './types';

const history: Thread = { id: 'chat', cwd: '', preview: '', updatedAt: 1, turns: [
  { id: 'turn', status: 'completed', items: Array.from({ length: 25 }, (_, index) => ({
    id: `item-${index}`, type: 'agentMessage', text: `Message ${index}`,
  })) },
] };
let controller: ChatController;
let events: ConnectionEvents;
let clock = 1000;
let fail = false;
let resume: (() => void) | undefined;
let pause = false;
const request = vi.fn<ChatConnection['request']>();

beforeEach(async () => {
  clock = 1000; fail = false; pause = false; resume = undefined;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  request.mockReset().mockImplementation(async (method, body) => {
    const input = body as { operation?: string; threadId?: string; window?: HistoryWindow; known?: HistoryVersion };
    if (method === 'connect') return [];
    if (input?.operation !== 'syncHistory') return { data: [], nextCursor: null };
    if (pause) await new Promise<void>(resolve => { resume = resolve; });
    if (fail) throw new Error('History unavailable');
    const page = sliceHistory({ ...history, id: input.threadId! }, input.window);
    return { ...historyDelta(page.thread, input.known), page: page.page };
  });
  controller = new ChatController(callbacks => {
    events = callbacks;
    return { start() { events.mode('relay'); events.ready(); }, stop() {},
      request: <T>(...args: Parameters<ChatConnection['request']>) => request(...args) as Promise<T> };
  });
  controller.start();
  await vi.waitFor(() => expect(controller.snapshot().ready).toBe(true));
  await controller.select({ ...history, turns: [] });
});

afterEach(() => { controller.stop(); vi.restoreAllMocks(); });

it('reports actual page sizes and elapsed time, including the final and empty pages', async () => {
  expect(controller.snapshot().historyLoad).toBeUndefined();
  for (const count of [10, 5, 0]) {
    pause = true;
    const loading = controller.loadOlder();
    expect(controller.snapshot().historyLoad).toBeUndefined();
    clock += 1250;
    resume!();
    await loading;
    expect(controller.snapshot().historyLoad).toEqual({
      threadId: history.id, count, durationMs: 1250, completedAt: clock,
    });
  }
});

it('includes queued wait time and does not count a background refresh as a loaded page', async () => {
  pause = true;
  const refresh = controller.refreshSelected();
  await controller.loadOlder();
  await controller.loadOlder();
  clock += 500;
  resume!();
  await refresh;
  expect(controller.snapshot().historyLoad).toBeUndefined();
  expect(controller.snapshot().historyLoadingMore).toBe(true);
  clock += 700;
  resume!();
  await vi.waitFor(() => expect(controller.snapshot().historyLoadingMore).toBe(false));
  expect(controller.snapshot().historyLoad).toMatchObject({ count: 10, durationMs: 1200 });
});

it('does not announce a failed or obsolete read', async () => {
  fail = true;
  await controller.loadOlder();
  expect(controller.snapshot().error).toBe('History unavailable');
  expect(controller.snapshot().historyLoad).toBeUndefined();
  fail = false; pause = true;
  const loading = controller.loadOlder();
  const oldResume = resume!;
  pause = false;
  await controller.select({ ...history, id: 'other', turns: [] });
  oldResume();
  await loading;
  expect(controller.snapshot().selected?.id).toBe('other');
  expect(controller.snapshot().historyLoad).toBeUndefined();
});

it('counts only prepended records when fresh replies arrive during the read', () => {
  const before = sliceHistory(history).thread;
  const loaded: Thread = { ...history, turns: [...history.turns!, {
    id: 'live', status: 'inProgress', items: [{ id: 'new-reply', type: 'agentMessage', text: 'New' }],
  }] };
  expect(historyLoadResult(before, loaded, clock).count).toBe(15);
});

it('reports locally loaded history and leaves missing cache reads unannounced', async () => {
  controller.stop();
  const read: OfflineHistoryStore['read'] = vi.fn(async (_id, window) => {
    clock += 250;
    return fail ? null : { ...sliceHistory(history, window), archived: false };
  });
  const store: OfflineHistoryStore = { read, list: async () => [], save: async () => {},
    remove: async () => {}, readImage: async () => null, saveImage: async () => {} };
  controller = new ChatController(() => ({ start() {}, stop() {},
    request: <T>(...args: Parameters<ChatConnection['request']>) => request(...args) as Promise<T> }), store);
  await controller.select({ ...history, turns: [] });
  expect(controller.snapshot().historyLoad).toBeUndefined();
  await controller.loadOlder();
  expect(controller.snapshot().historyLoad).toMatchObject({ count: 10, durationMs: 250 });
  fail = true;
  await controller.loadOlder();
  expect(controller.snapshot().historyLoad).toBeUndefined();
});
