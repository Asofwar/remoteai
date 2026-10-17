import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { registerDesktopMappingStream } from './streamBridge';
import { decodeNativeBulkBatch } from '../../../../../../shared/remote-chat/nativeBulkChannel';
import { BulkCipher } from '../../../../../../shared/remote-chat/bulkCipher';
import { STREAM_MANIFEST } from '../../../../../../shared/port-mapping/streamMux';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const identity = { transferId: '11111111-1111-4111-8111-111111111111', epoch: '22222222-2222-4222-8222-222222222222' };
const requestId = '33333333-3333-4333-8333-333333333333';
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it('binds native sockets, relays only authenticated control/progress, and closes after polling failure', async () => {
  let next!: (value: unknown) => void;
  let fail!: (error: Error) => void;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'port_mapping_poll') return new Promise((resolve, reject) => { next = resolve; fail = reject; });
  });
  const options = { identity, receiverKey: new Uint8Array(32).fill(9),
    authenticated: vi.fn(), progress: vi.fn(), failed: vi.fn() };
  const receiver = (await registerDesktopMappingStream(options))!;
  await receiver.bind(requestId, 7);
  expect(invoke).toHaveBeenCalledWith('port_mapping_receiver',
    { request: { type: 'bind', id: identity.transferId, request: requestId, socket: 7 } });
  next({ records: [{ requestId, data: [5] }], progress: [{ requestId, consumed: 1024, eof: false }] }); await flush();
  expect(options.authenticated).toHaveBeenCalledWith(requestId, Uint8Array.of(5));
  expect(options.progress).toHaveBeenCalledWith(requestId, { requestId, consumed: 1024, eof: false });
  fail(new Error('Receiver expired')); await flush();
  expect(options.failed).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('port_mapping_receiver',
    { request: { type: 'close', id: identity.transferId, reason: 'poll' } });
});

it('batches RTC ciphertext unchanged into the same native receiver and bounds a stalled queue', async () => {
  const batches: Uint8Array[][] = [];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'port_mapping_receive') {
      const data = args as Uint8Array;
      batches.push(decodeNativeBulkBatch(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    }
    if (command === 'port_mapping_poll') return new Promise(() => {});
  });
  const options = { identity, receiverKey: new Uint8Array(32).fill(9),
    authenticated: vi.fn(), progress: vi.fn(), failed: vi.fn() };
  const receiver = (await registerDesktopMappingStream(options))!;
  const cipher = new BulkCipher(new Uint8Array(32).fill(1), { ...identity, manifestId: STREAM_MANIFEST,
    sessionId: 'session', desktop: true, desktopKey: 'host', clientKey: 'viewer' });
  try {
    const records = Array.from({ length: 20 }, () => cipher.encrypt({ requestId, block: 0, offset: 0 }, Uint8Array.of(5)));
    records.forEach(record => receiver.receive!(record)); await flush();
    expect(batches.map(batch => batch.length)).toEqual([16, 4]);
    expect(batches.flat()).toEqual(records);
    vi.mocked(invoke).mockImplementation(async () => new Promise(() => {}));
    for (let i = 0; i < 300; i++) receiver.receive!(new Uint8Array(16 * 1024));
    expect(options.failed).toHaveBeenCalledOnce();
  } finally { receiver.close(); cipher.destroy(); }
});
