import { expect, it, vi } from 'vitest';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import type { ConnectionEvents } from '../../../../shared/remote-chat/client/connection';

it('finishes the original GUI initialization across path changes and retains loaded chat state', async () => {
  let events!: ConnectionEvents;
  let initialize!: (value: unknown) => void;
  const request = vi.fn(async (method: string): Promise<unknown> => {
    if (method === 'connect') return new Promise((resolve) => { initialize = resolve; });
    return { data: [], nextCursor: null };
  });
  const controller = new ChatController((callbacks) => {
    events = callbacks;
    return { request: <T>(method: string) => request(method) as Promise<T>,
      start: () => { events.mode('relay'); events.ready(); }, stop: () => events.mode('offline') };
  });
  controller.start();
  events.mode('direct');
  events.mode('connecting');
  events.mode('relay');
  initialize([]);
  await vi.waitFor(() => expect(controller.snapshot().ready).toBe(true));
  const before = request.mock.calls.length;
  events.mode('direct');
  expect(controller.snapshot().ready).toBe(true);
  expect(request).toHaveBeenCalledTimes(before);
  expect(request.mock.calls.filter(([method]) => method === 'connect')).toHaveLength(1);
  controller.stop();
});
