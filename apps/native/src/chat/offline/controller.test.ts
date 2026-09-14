import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatController } from '../../../../../shared/remote-chat/client/controller';
import { OfflineWriter, type CachedConversation, type OfflineHistoryStore }
  from '../../../../../shared/remote-chat/client/offline';
import { offlineImage } from '../../../../../shared/remote-chat/client/offlineImages';
import type { ConnectionEvents } from '../../../../../shared/remote-chat/client/connection';
import { historyDelta } from '../../../../../shared/remote-chat/historySync';
import { mergeHistory } from '../../../../../shared/remote-chat/client/history';
import type { Thread } from '../types';

const thread = (id = 'chat', text = 'cached'): Thread => ({ id, preview: id, cwd: '/', updatedAt: 1,
  turns: [{ id: 'turn', status: 'inProgress', items: [{ id: 'item', type: 'agentMessage', text }] }] });
const value = (id = 'chat'): CachedConversation => ({ thread: thread(id), page: { hasMore: false }, archived: false });
function cache(): OfflineHistoryStore {
  return { list: vi.fn(async () => [value(), value('other')]), read: vi.fn(async (id) => value(id)),
    save: vi.fn(async () => {}), remove: vi.fn(async () => {}),
    readImage: vi.fn(async () => null), saveImage: vi.fn(async () => {}) };
}
const controllers: ChatController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) { controller.stop(); await controller.flushCache(); }
  vi.useRealTimers();
});
function setup(store = cache()) {
  let events!: ConnectionEvents;
  const request = vi.fn(async (_method: string, body?: unknown): Promise<unknown> => {
    if (_method === 'connect') return [];
    const input = body as { operation?: string; threadId?: string } | undefined;
    if (input?.operation === 'syncHistory') {
      const authoritative = thread(input.threadId, 'new server reply');
      authoritative.turns![0].status = 'completed';
      return { ...historyDelta(authoritative), page: { hasMore: false } };
    }
    return { data: [], nextCursor: null };
  });
  const controller = new ChatController((callbacks) => {
    events = callbacks;
    return { start() {}, stop() {}, request: request as never };
  }, store);
  controllers.push(controller);
  controller.start();
  return { controller, events, request, store };
}

describe('offline chat lifecycle', () => {
  it('replaces stale cached messages while retaining notifications received during the history read', () => {
    const cached = thread();
    cached.turns![0].items.push({ id: 'removed', type: 'agentMessage', text: 'old' });
    const remote = thread('chat', 'server');
    remote.turns![0].status = 'completed';
    const live: Thread = { ...cached, turns: [{ ...cached.turns![0], items: [
      ...cached.turns![0].items, { id: 'new', type: 'agentMessage', text: 'notification during read' },
    ] }] };
    const merged = mergeHistory(remote, live, cached, true);
    expect(merged.turns?.[0].items.map((item) => item.id)).toEqual(['item', 'new']);
    expect(merged.turns?.[0].items[0].text).toBe('server');
    expect(merged.turns?.[0].items[1].text).toBe('notification during read');
  });

  it('lists and switches cached conversations without network requests, with sending disabled', async () => {
    const { controller, request } = setup();
    await vi.waitFor(() => expect(controller.snapshot().threads).toHaveLength(2));
    await controller.select(thread());
    expect(controller.snapshot().selected?.turns?.[0].items[0].text).toBe('cached');
    await controller.select(thread('other'));
    expect(controller.snapshot().selected?.id).toBe('other');
    expect(controller.snapshot().historyOffline).toBe(true);
    expect(await controller.send({ text: 'offline', access: 'read-only' })).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a stale disk selection and replaces cached running state after reconnect', async () => {
    const store = cache();
    let finish!: (result: CachedConversation) => void;
    vi.mocked(store.read).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { controller, events } = setup(store);
    const first = controller.select(thread());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await controller.select(thread('other'));
    finish(value()); await first;
    expect(controller.snapshot().selected?.id).toBe('other');
    events.mode('relay'); events.ready();
    await vi.waitFor(() => expect(controller.snapshot().ready).toBe(true));
    expect(controller.snapshot().selected?.turns?.[0].items[0].text).toBe('new server reply');
    expect(controller.snapshot().selected?.turns?.[0].status).toBe('completed');
    expect(controller.snapshot().historyOffline).toBe(false);
  });

  it('does not let a slow local read overwrite a successful connection', async () => {
    const store = cache();
    let finish!: (result: CachedConversation) => void;
    vi.mocked(store.read).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { controller, events } = setup(store);
    const selecting = controller.select(thread());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    events.mode('relay'); events.ready();
    await vi.waitFor(() => expect(controller.snapshot().ready).toBe(true));
    finish(value()); await selecting;
    expect(controller.snapshot().selected?.turns?.[0].items[0].text).toBe('new server reply');
  });

  it('keeps online chat usable after a cache failure', async () => {
    const store = cache();
    vi.mocked(store.list).mockRejectedValue(new Error('private disk path'));
    vi.mocked(store.save).mockRejectedValue(new Error('disk full'));
    const { controller, events } = setup(store);
    await vi.waitFor(() => expect(controller.snapshot().cacheError).toBeTruthy());
    expect(controller.snapshot().cacheError).not.toContain('private');
    events.mode('relay'); events.ready();
    await vi.waitFor(() => expect(controller.snapshot().ready).toBe(true));
    await controller.select(thread()); await controller.flushCache();
    expect(controller.snapshot().ready).toBe(true);
    expect(controller.snapshot().selected?.turns?.[0].items[0].text).toBe('new server reply');
  });

  it('coalesces streaming writes, keeps one write in flight and flushes the newest snapshot', async () => {
    vi.useFakeTimers();
    const store = cache();
    let finish!: () => void;
    vi.mocked(store.save).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const writer = new OfflineWriter(store, vi.fn());
    for (let index = 0; index < 10; index++) writer.remember(value());
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.save).toHaveBeenCalledTimes(1);
    const latest = { ...value(), thread: thread('chat', 'latest') };
    writer.remember(latest);
    const flushing = writer.flush();
    expect(store.save).toHaveBeenCalledTimes(1);
    finish(); await flushing;
    expect(store.save).toHaveBeenLastCalledWith(latest);
    expect(store.save).toHaveBeenCalledTimes(2);
  });

  it('reads saved images offline and reports uncached originals without making a request', async () => {
    const store = cache();
    const load = vi.fn(async () => 'data:image/png;base64,abc');
    const options = { store, online: false, key: 'preview', load, failed: vi.fn() };
    vi.mocked(store.readImage).mockResolvedValueOnce('data:image/png;base64,saved');
    expect(await offlineImage(options)).toContain('saved');
    await expect(offlineImage({ ...options, key: 'original' })).rejects.toThrow('尚未缓存');
    expect(load).not.toHaveBeenCalled();
    expect(await offlineImage({ ...options, online: true })).toContain('abc');
    expect(store.saveImage).toHaveBeenCalled();
  });
});
