import { afterEach, expect, it, vi } from 'vitest';
import { MappingByteStream } from '../../../../../../shared/port-mapping/stream';
import { STREAM_FRAME_BYTES, type StreamFrame } from '../../../../../../shared/port-mapping/streamProtocol';

afterEach(() => vi.useRealTimers());

it('does not resend bytes or EOF while a reliable receiver is busy', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const sent: StreamFrame[] = [];
  const stream = new MappingByteStream({ reliable: () => true, closed() {},
    send: async frames => { sent.push(...frames); } });
  const body = new Uint8Array(STREAM_FRAME_BYTES * 2);
  let ended: Promise<void> | undefined;
  try {
    await stream.write(body);
    ended = stream.end();
    void ended.catch(() => {});
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent.filter(frame => frame.type === 'data')).toHaveLength(2);
    expect(sent.filter(frame => frame.type === 'end')).toHaveLength(1);
    stream.receive({ type: 'ack', offset: body.length, eof: true });
    await ended;
  } finally { stream.close(); await ended?.catch(() => {}); }
});

function pair(options: { reliable: boolean; missing: StreamFrame['type']; reject: boolean }) {
  const streams: MappingByteStream[] = [], sent: StreamFrame[] = [];
  let dropped = false;
  for (let side = 0; side < 2; side++) {
    streams.push(new MappingByteStream({ reliable: () => options.reliable, closed() {}, send: async frames => {
      sent.push(...frames);
      for (const frame of frames) {
        if (!dropped && frame.type === options.missing) {
          dropped = true;
          if (options.reject) throw new Error('Send failed');
          continue;
        }
        queueMicrotask(() => streams[1 - side].receive(frame));
      }
    } }));
  }
  return { streams, sent, close: () => streams.forEach(stream => stream.close()) };
}

async function collect(stream: MappingByteStream) {
  const parts: Uint8Array[] = [];
  for (;;) {
    const result = await stream.read(); parts.push(result.data);
    if (result.eof) return Buffer.concat(parts);
  }
}

it.each(['data', 'end', 'ack'] as const)('recovers a lost UDP %s without a path change', async missing => {
  vi.useFakeTimers();
  const connection = pair({ reliable: false, missing, reject: false });
  const [left, right] = connection.streams, body = Buffer.alloc(STREAM_FRAME_BYTES * 2, 93);
  const received = collect(right), sending = left.write(body).then(() => left.end());
  try {
    await vi.advanceTimersByTimeAsync(2500);
    expect((await received).equals(body)).toBe(true);
    await sending;
    expect(connection.sent.filter(frame => frame.type === missing).length).toBeGreaterThan(1);
  } finally { connection.close(); }
});

it.each(['data', 'end', 'ack'] as const)('retries a rejected relay %s without replaying successful sends',
  async missing => {
    vi.useFakeTimers();
    const connection = pair({ reliable: true, missing, reject: true });
    const [left, right] = connection.streams, body = Buffer.from('reliable socket');
    const received = collect(right), sending = left.write(body).then(() => left.end());
    try {
      await vi.advanceTimersByTimeAsync(1500);
      expect((await received).equals(body)).toBe(true);
      await sending;
      expect(connection.sent.filter(frame => frame.type === 'data')).toHaveLength(missing === 'data' ? 2 : 1);
      expect(connection.sent.filter(frame => frame.type === 'end')).toHaveLength(missing === 'end' ? 2 : 1);
    } finally { connection.close(); }
  });

it('replays a batch when the reliable path changes during its asynchronous send', async () => {
  vi.useFakeTimers();
  const sent: StreamFrame[] = [];
  const stream = new MappingByteStream({ reliable: () => true, closed() {}, send: async frames => {
    sent.push(...frames);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } });
  try {
    await stream.write(Uint8Array.of(9));
    await vi.advanceTimersByTimeAsync(50);
    stream.retry();
    await vi.advanceTimersByTimeAsync(4000);
    expect(sent.filter(frame => frame.type === 'data')).toHaveLength(2);
  } finally { stream.close(); }
});

it('starts UDP retry deadlines after a queued send finishes', async () => {
  vi.useFakeTimers();
  const sent: StreamFrame[] = [];
  const stream = new MappingByteStream({ reliable: () => false, closed() {}, send: async frames => {
    sent.push(...frames);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } });
  try {
    await stream.write(Uint8Array.of(9));
    await vi.advanceTimersByTimeAsync(1500);
    expect(sent.filter(frame => frame.type === 'data')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.filter(frame => frame.type === 'data')).toHaveLength(2);
  } finally { stream.close(); }
});

it('coalesces native consumption acknowledgements while a reliable send is queued', async () => {
  vi.useFakeTimers();
  const sent: StreamFrame[] = [];
  const stream = new MappingByteStream({ reliable: () => true, nativeReceive: true, closed() {},
    send: async frames => {
      sent.push(...frames); await new Promise(resolve => setTimeout(resolve, 1000));
    } });
  try {
    stream.receiveNativeProgress({ consumed: 1024 * 1024, eof: false });
    for (let index = 1; index <= 10; index++) {
      stream.receiveNativeProgress({ consumed: (index + 1) * 1024 * 1024, eof: false });
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ type: 'ack', offset: 11 * 1024 * 1024, eof: false });
  } finally { stream.close(); }
});

it('still closes a reliable stream that makes no consumption progress', async () => {
  vi.useFakeTimers();
  const closed = vi.fn();
  const stream = new MappingByteStream({ reliable: () => true, closed, send: async () => {} });
  await stream.write(Uint8Array.of(7));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(closed).toHaveBeenCalledOnce();
});
