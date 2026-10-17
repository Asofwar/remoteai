import { beforeEach, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import type { MappingStreamBridge } from '../../../../../shared/port-mapping/streamClient';

const native = vi.hoisted(() => ({ registerReceiver: vi.fn(), pollReceiver: vi.fn(), close: vi.fn(),
  bind: vi.fn(), unbind: vi.fn() }));
vi.mock('react-native', () => ({ NativeModules: { PortMappingStreams: native } }));
import { registerMappingStream } from './streamBridge';

beforeEach(() => vi.resetAllMocks());
function options(): Parameters<MappingStreamBridge>[0] {
  return { identity: { transferId: 'transfer', epoch: 'epoch' }, receiverKey: new Uint8Array(32).fill(7),
    authenticated: vi.fn(), progress: vi.fn(), failed: vi.fn() };
}

it('delivers native authenticated binary frames and discards a poll completed after close', async () => {
  const input = options();
  let finish!: (result: { records: { requestId: string; data: string }[]; progress: [] }) => void;
  native.pollReceiver.mockResolvedValueOnce({
    records: [{ requestId: 'socket', data: Buffer.from([0, 255, 7]).toString('base64') }], progress: [],
  })
    .mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const receiver = (await registerMappingStream!(input))!;
  await vi.waitFor(() => expect(input.authenticated).toHaveBeenCalledWith('socket', Uint8Array.from([0, 255, 7])));
  expect(native.registerReceiver).toHaveBeenCalledWith('transfer', 'epoch', '07'.repeat(32));
  receiver.close(); receiver.close();
  finish({ records: [{ requestId: 'socket', data: 'AA==' }], progress: [] }); await Promise.resolve();
  expect(input.authenticated).toHaveBeenCalledTimes(1);
  expect(native.close).toHaveBeenCalledTimes(1);
  expect(input.failed).not.toHaveBeenCalled();
});

it('closes and fails the session when native authentication or polling fails', async () => {
  const input = options();
  native.pollReceiver.mockRejectedValue(new Error('STREAM_CLOSED'));
  await registerMappingStream!(input);
  await vi.waitFor(() => expect(input.failed).toHaveBeenCalledTimes(1));
  expect(native.close).toHaveBeenCalledWith('transfer');
  expect(input.authenticated).not.toHaveBeenCalled();
});

it('never accepts an encrypted legacy record as authenticated plaintext', async () => {
  const input = options();
  native.pollReceiver.mockResolvedValue({ records: [{ data: 'AA==', path: 'direct' }], progress: [] });
  await registerMappingStream!(input);
  await vi.waitFor(() => expect(input.failed).toHaveBeenCalledTimes(1));
  expect(input.authenticated).not.toHaveBeenCalled();
  expect(native.pollReceiver).toHaveBeenCalledTimes(1);
});

it('binds the native socket and forwards coalesced write progress without decoding payload', async () => {
  const input = options();
  const progress = { requestId: 'socket', consumed: 2 * 1024 * 1024, eof: false };
  native.pollReceiver.mockResolvedValueOnce({ records: [], progress: [progress] })
    .mockImplementation(() => new Promise(() => {}));
  const receiver = (await registerMappingStream!(input))!;
  await receiver.bind('socket', 42);
  expect(native.bind).toHaveBeenCalledWith('transfer', 'socket', 42);
  expect(input.progress).toHaveBeenCalledWith('socket', progress);
  expect(input.authenticated).not.toHaveBeenCalled();
  receiver.unbind('socket'); receiver.close(); receiver.unbind('late');
  expect(native.unbind.mock.calls).toEqual([['transfer', 'socket']]);
});
