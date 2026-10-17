import { expect, it, vi } from 'vitest';
import { MappingByteStream } from '../../../../../../shared/port-mapping/stream';
import type { StreamFrame } from '../../../../../../shared/port-mapping/streamProtocol';

function stream() {
  const sent: StreamFrame[] = [];
  const closed = vi.fn();
  const socket = new MappingByteStream({ reliable: () => true, nativeReceive: true, closed,
    send: async frames => { sent.push(...frames); } });
  return { socket, sent, closed };
}

it('acknowledges only native consumed offsets, replays credit on path change, and waits for drained EOF', async () => {
  vi.useFakeTimers();
  const { socket, sent } = stream();
  try {
    const complete = vi.fn();
    const reading = socket.read().then(complete);
    socket.receiveNativeProgress({ consumed: 512 * 1024, eof: false });
    expect(sent).toEqual([{ type: 'ack', offset: 512 * 1024, eof: false }]);
    await Promise.resolve(); expect(complete).not.toHaveBeenCalled();
    socket.retry(); await vi.advanceTimersByTimeAsync(8);
    expect(sent.at(-1)).toEqual({ type: 'ack', offset: 512 * 1024, eof: false });
    socket.receiveNativeProgress({ consumed: 512 * 1024 + 1, eof: true });
    await reading;
    expect(complete).toHaveBeenCalledWith({ data: new Uint8Array(), eof: true });
    expect(sent.at(-1)).toEqual({ type: 'ack', offset: 512 * 1024 + 1, eof: true });
  } finally { socket.close(); vi.useRealTimers(); }
});

it.each(['failure', 'backwards', 'payload', 'after-end'])('closes a native stream on %s without accepting more data', reason => {
  const { socket, closed } = stream();
  try {
    socket.receiveNativeProgress({ consumed: 100, eof: reason === 'after-end' });
    if (reason === 'payload') socket.receive({ type: 'data', offset: 0, data: Uint8Array.of(7) });
    else socket.receiveNativeProgress({ consumed: reason === 'backwards' ? 99 : 100, eof: false,
      failed: reason === 'failure' });
    expect(socket.closed).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
  } finally { socket.close(); }
});
