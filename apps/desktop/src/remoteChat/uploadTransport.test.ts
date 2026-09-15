import { afterEach, expect, it, vi } from 'vitest';
import { Assembler, chunks } from '../../../../shared/remote-chat/framing';
import { DEFAULT_CHAT_POLICY, MIB, setChatPolicy } from '../../../../shared/remote-chat/policy';
import { ChatRpc } from '../../../../shared/remote-chat/rpc';
import type { RpcMessage } from '../../../../shared/remote-chat/protocol';

afterEach(() => { setChatPolicy(DEFAULT_CHAT_POLICY); vi.useRealTimers(); });

it('transfers payloads above the old 8 MB envelope after raising the total limit', () => {
  const message: RpcMessage = { kind: 'request', id: 'large', method: 'request',
    body: { operation: 'send', attachments: [{ data: 'A'.repeat(9 * MIB) }] } };
  expect(() => chunks(message, 'large').next()).toThrow();
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, fileUploadMaxMb: 8, fileUploadTotalMaxMb: 12 });
  const frames = chunks(message, 'large');
  const assembler = new Assembler();
  expect(assembler.accept(frames.next().value!)).toBeNull();
  // An in-flight transfer keeps its envelope; actual upload acceptance rechecks the latest policy.
  setChatPolicy(DEFAULT_CHAT_POLICY);
  let result: RpcMessage | null = null;
  for (const frame of frames) result = assembler.accept(frame);
  expect(result).toEqual(message);
});

it('keeps a continuously progressing legacy transfer alive beyond one minute', () => {
  vi.useFakeTimers();
  const message: RpcMessage = { kind: 'response', id: 'slow', data: 'x'.repeat(5000) };
  const assembler = new Assembler();
  let result: RpcMessage | null = null;
  for (const frame of chunks(message, 'slow')) {
    result = assembler.accept(frame);
    vi.advanceTimersByTime(40_000);
  }
  expect(result).toEqual(message);
});

it('allows a large upload to finish sending before the ordinary one-minute deadline', async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => {});
  const rpc = new ChatRpc({ send, event: () => {}, prefix: 'upload' });
  const pending = rpc.request('request', { operation: 'send', attachments: [{ data: 'A'.repeat(2 * MIB) }] });
  await vi.advanceTimersByTimeAsync(61_000);
  rpc.receive({ kind: 'response', id: 'upload:1', data: 'sent' });
  await expect(pending).resolves.toBe('sent');
  rpc.close();
});
