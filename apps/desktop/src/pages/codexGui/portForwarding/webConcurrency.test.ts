import { expect, it, vi } from 'vitest';
import { WebMappingTunnel } from '../../../../../web/src/chat/portMapping/httpTunnel';
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';
import type { ForwardingClient } from '../../../../../../shared/port-mapping/service';

async function fixture() {
  const bridgeBudget = new StreamBudget(1);
  const client: ForwardingClient = { openResource: vi.fn(), closeResource: vi.fn(),
    link: vi.fn<ForwardingClient['link']>(async (_scope, request) => request.type === 'connect'
      ? { type: 'socket', id: 'probe' } : { type: 'done' }) };
  const tunnel = new WebMappingTunnel(client, { localPort: 3002, bridgeBudget, onClosed: vi.fn() });
  await tunnel.resolve('resource', 'http://127.0.0.1:3002');
  vi.mocked(client.link).mockClear();
  return { bridgeBudget, client, tunnel };
}

it('cancels queued HTTP and WebSocket requests together when a web mapping stops', async () => {
  const { bridgeBudget, client, tunnel } = await fixture();
  const release = await bridgeBudget.acquire(new AbortController().signal);
  const requests = Promise.allSettled([
    tunnel.request({ url: '/' }),
    tunnel.openWebSocket('ws://127.0.0.1:3002', [], vi.fn()),
  ]);
  await tunnel.close();
  expect((await requests).every(result => result.status === 'rejected')).toBe(true);
  expect(client.link).not.toHaveBeenCalled();
  release!();
  expect(bridgeBudget.active).toBe(0);
});

it('returns an immediately granted slot if stopped before the waiting caller resumes', async () => {
  const { bridgeBudget, client, tunnel } = await fixture();
  const socket = tunnel.openWebSocket('ws://127.0.0.1:3002', [], vi.fn());
  const result = expect(socket).rejects.toThrow('Mapping stopped');
  await tunnel.close(); await result;
  expect(client.link).not.toHaveBeenCalled();
  expect(bridgeBudget.active).toBe(0);
});
