import { beforeEach, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import type { MappingStreamBridge } from '../../../../../shared/port-mapping/streamClient';

const native = vi.hoisted(() => ({ registerReceiver: vi.fn(), poll: vi.fn(), close: vi.fn() }));
vi.mock('react-native', () => ({ NativeModules: { PortMappingStreams: native } }));
import { registerMappingStream } from './streamBridge';

beforeEach(() => vi.resetAllMocks());
function options(): Parameters<MappingStreamBridge>[0] {
  return { identity: { transferId: 'transfer', epoch: 'epoch' }, receiverKey: new Uint8Array(32).fill(7),
    authenticated: vi.fn(), failed: vi.fn() };
}

it('delivers native authenticated binary frames and discards a poll completed after close', async () => {
  const input = options();
  let finish!: (records: { requestId: string; data: string }[]) => void;
  native.poll.mockResolvedValueOnce([{ requestId: 'socket', data: Buffer.from([0, 255, 7]).toString('base64') }])
    .mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const close = await registerMappingStream!(input);
  await vi.waitFor(() => expect(input.authenticated).toHaveBeenCalledWith('socket', Uint8Array.from([0, 255, 7])));
  expect(native.registerReceiver).toHaveBeenCalledWith('transfer', 'epoch', '07'.repeat(32));
  close(); close(); finish([{ requestId: 'socket', data: 'AA==' }]); await Promise.resolve();
  expect(input.authenticated).toHaveBeenCalledTimes(1);
  expect(native.close).toHaveBeenCalledTimes(1);
  expect(input.failed).not.toHaveBeenCalled();
});

it('closes and fails the session when native authentication or polling fails', async () => {
  const input = options();
  native.poll.mockRejectedValue(new Error('STREAM_CLOSED'));
  await registerMappingStream!(input);
  await vi.waitFor(() => expect(input.failed).toHaveBeenCalledTimes(1));
  expect(native.close).toHaveBeenCalledWith('transfer');
  expect(input.authenticated).not.toHaveBeenCalled();
});

it('never accepts an encrypted legacy record as authenticated plaintext', async () => {
  const input = options();
  native.poll.mockResolvedValue([{ data: 'AA==', path: 'direct' }]);
  await registerMappingStream!(input);
  await vi.waitFor(() => expect(input.failed).toHaveBeenCalledTimes(1));
  expect(input.authenticated).not.toHaveBeenCalled();
  expect(native.poll).toHaveBeenCalledTimes(1);
});
