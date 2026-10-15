import { afterEach, expect, it, vi } from 'vitest';
import { MappingSync, type MappingDocument } from '../../../../../../shared/port-mapping/sync';
import { PortForwardingService } from '../../../../../../shared/port-mapping/service';
import type { MappingStorage, PortMapping } from '../../../../../../shared/port-mapping/settings';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); });
const flush = async () => { for (let count = 0; count < 40; count++) await Promise.resolve(); };
const storage = (): MappingStorage => {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};
function server() {
  let doc: MappingDocument = { revision: 0, mappings: [] };
  const exchange = vi.fn(async (input?: MappingDocument) => {
    if (!input) return structuredClone(doc);
    if (input.revision !== doc.revision) return { ...structuredClone(doc), accepted: false };
    doc = { revision: doc.revision + 1, mappings: structuredClone(input.mappings) };
    return { ...structuredClone(doc), accepted: true };
  });
  return { exchange, document: () => doc };
}
function device(options: { exchange: ReturnType<typeof server>['exchange']; cache?: MappingStorage;
  saved?: PortMapping[]; scope?: string }) {
  const service = new PortForwardingService({ openResource: async () => 'resource',
    closeResource: async () => {}, link: async () => ({ type: 'done' }) }, options.saved ?? [],
  { createId: () => crypto.randomUUID(), createTunnel: () => ({ resolve: async (_id, url) => url, close: async () => {} }) });
  const sync = new MappingSync(service, { scope: options.scope ?? 'account/computer',
    storage: options.cache ?? storage(), exchange: options.exchange });
  const stop = sync.start();
  cleanup.push(stop, service.dispose);
  return { service, sync, stop };
}

it('syncs additions, stable IDs, edits and removals between phone, desktop and Web', async () => {
  const cloud = server();
  const phone = device(cloud), desktop = device(cloud), web = device(cloud);
  await flush();
  phone.service.setConnected(true);
  phone.service.add(3000, 13000, '192.168.1.20'); await flush();
  await desktop.sync.refresh(); await web.sync.refresh();
  const original = phone.service.snapshot()[0];
  expect(desktop.service.snapshot()[0]).toMatchObject({ id: original.id, status: 'stopped', remoteHost: '192.168.1.20' });
  await desktop.service.edit(original.id, { remoteHost: '::1', remotePort: 8080, localPort: 18080 });
  await flush(); await phone.sync.refresh(); await web.sync.refresh(); await flush();
  expect(phone.service.snapshot()[0]).toMatchObject({ id: original.id, status: 'running', remotePort: 8080 });
  expect(web.service.snapshot()[0]).toMatchObject({ id: original.id, status: 'stopped', remoteHost: '::1' });
  await web.service.remove(original.id); await flush(); await phone.sync.refresh(); await desktop.sync.refresh();
  expect(phone.service.snapshot()).toEqual([]);
  expect(desktop.service.snapshot()).toEqual([]);
});

it('merges concurrent additions without losing unrelated records and retries a stale revision', async () => {
  const cloud = server(), first = device(cloud), second = device(cloud);
  await flush();
  first.service.add(3000, 13000); second.service.add(4000, 14000); await flush();
  await first.sync.refresh(); await second.sync.refresh(); await first.sync.refresh();
  expect(cloud.document().mappings.map(entry => entry.remotePort).sort()).toEqual([3000, 4000]);
  expect(first.service.snapshot()).toHaveLength(2);
  expect(second.service.snapshot()).toHaveLength(2);
});

it('retains an edit made while a write is in flight', async () => {
  const cloud = server(); let finish!: () => void;
  const exchange = vi.fn(async (input?: MappingDocument) => {
    if (input && !finish) await new Promise<void>(resolve => { finish = resolve; });
    return cloud.exchange(input);
  });
  const first = device({ exchange }); await flush();
  first.service.add(3000, 13000); await flush();
  await first.service.edit(first.service.snapshot()[0].id, { remotePort: 4000, localPort: 14000 });
  finish(); await flush(); await first.sync.refresh();
  expect(cloud.document().mappings[0].remotePort).toBe(4000);
});

it('persists offline deletions and does not resurrect them after a stale client restarts', async () => {
  const cloud = server(), cache = storage(); let offline = false;
  const exchange = vi.fn(async (input?: MappingDocument) => {
    if (offline) throw new Error('offline');
    return cloud.exchange(input);
  });
  const first = device({ exchange, cache }); await flush();
  first.service.add(3000, 13000); await flush();
  const stale = device(cloud); await flush();
  const staleSaved = stale.service.snapshot(); stale.stop();
  offline = true;
  await first.service.remove(first.service.snapshot()[0].id); await flush(); first.stop();
  expect(first.sync.snapshot()).toContain('暂未同步');
  offline = false;
  const resumed = device({ exchange, cache }); await flush();
  expect(cloud.document().mappings).toEqual([]);
  const staleCache = storage(); staleCache.setItem('codex-port-mapping-sync:account/computer', '{}');
  const reopened = device({ exchange, cache: staleCache, saved: staleSaved }); await flush();
  expect(reopened.service.snapshot()).toEqual([]);
  expect(resumed.service.snapshot()).toEqual([]);
});

it('ignores delayed replies after disposal and keeps polling single-flight', async () => {
  let resolve!: (document: MappingDocument) => void;
  const exchange = vi.fn(() => new Promise<MappingDocument>(done => { resolve = done; }));
  const current = device({ exchange });
  await current.sync.refresh(); await current.sync.refresh();
  expect(exchange).toHaveBeenCalledTimes(1);
  current.stop(); resolve({ revision: 1, mappings: [{ id: 'old-user', remotePort: 80, localPort: 8080 }] });
  await flush(); expect(current.service.snapshot()).toEqual([]);
});

it('restores pending offline edits even when the last visible cache was not written', async () => {
  const cache = storage();
  cache.setItem('codex-port-mapping-sync:account/computer', JSON.stringify({
    old: null, edited: { id: 'edited', remoteHost: '127.0.0.1', remotePort: 8080, localPort: 18080 },
  }));
  const exchange = vi.fn(async (): Promise<MappingDocument> => { throw new Error('offline'); });
  const current = device({ cache, exchange, saved: [{ id: 'old', remotePort: 3000, localPort: 13000 }] });
  await flush();
  expect(current.service.snapshot()).toMatchObject([{ id: 'edited', remotePort: 8080, status: 'stopped' }]);
});

it('does not acknowledge pending changes from an invalid server response', async () => {
  const cloud = server(); let corrupt = true;
  const exchange = vi.fn(async (input?: MappingDocument) => {
    if (input && corrupt) return { revision: 1, mappings: [{ id: 'invalid', remotePort: 0, localPort: 0 }], accepted: true };
    return cloud.exchange(input);
  });
  const current = device({ exchange }); await flush();
  current.service.add(3000, 13000); await flush();
  expect(current.sync.snapshot()).toContain('暂未同步');
  expect(current.service.snapshot()[0].remotePort).toBe(3000);
  corrupt = false; await current.sync.refresh();
  expect(cloud.document().mappings[0].remotePort).toBe(3000);
});
