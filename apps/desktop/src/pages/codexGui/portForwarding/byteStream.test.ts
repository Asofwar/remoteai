import { afterEach, expect, it, vi } from 'vitest';
import { MappingByteStream } from '../../../../../../shared/port-mapping/stream';
import { decodeStreamFrame, encodeStreamFrame, STREAM_FRAME_BYTES, STREAM_WINDOW_BYTES, type StreamFrame }
  from '../../../../../../shared/port-mapping/streamProtocol';

afterEach(() => vi.useRealTimers());

function pair(latency = 30) {
  let drop = false;
  const sent: { from: number; frame: StreamFrame }[] = [];
  const streams: MappingByteStream[] = [];
  for (let from = 0; from < 2; from++) {
    streams.push(new MappingByteStream({ reliable: () => false, closed() {}, send: async frames => {
      for (const frame of frames) {
        sent.push({ from, frame });
        if (!drop) setTimeout(() => streams[1 - from].receive(decodeStreamFrame(encodeStreamFrame(frame))), latency);
      }
    } }));
  }
  return { streams, sent, drop: (value: boolean) => { drop = value; },
    close: () => streams.forEach(stream => stream.close()) };
}

async function collect(stream: MappingByteStream) {
  const parts: Uint8Array[] = [];
  for (;;) {
    const reply = await stream.read();
    parts.push(reply.data);
    if (reply.eof) return Buffer.concat(parts);
  }
}

it('streams 8 MiB at 60 ms RTT without waiting for an RPC for every chunk', async () => {
  vi.useFakeTimers();
  const connection = pair();
  const [sender, receiver] = connection.streams;
  const content = Buffer.alloc(8 * 1024 * 1024, 71);
  const received = collect(receiver);
  const transfer = sender.write(content).then(() => sender.end());
  try {
    await vi.advanceTimersByTimeAsync(500);
    expect((await received).equals(content)).toBe(true);
    await transfer;
    const data = connection.sent.filter(value => value.from === 0 && value.frame.type === 'data');
    expect(data.length).toBe(Math.ceil(content.length / STREAM_FRAME_BYTES));
  } finally { connection.close(); }
});

it('bounds outstanding bytes until the receiver consumes them and supports simultaneous reverse traffic', async () => {
  vi.useFakeTimers();
  const connection = pair();
  const [left, right] = connection.streams;
  let finished = false;
  const body = Buffer.alloc(STREAM_WINDOW_BYTES * 2, 19);
  const writing = left.write(body).then(() => { finished = true; return left.end(); });
  try {
    await vi.advanceTimersByTimeAsync(300);
    expect(finished).toBe(false);
    const frames = connection.sent.filter(value => value.from === 0 && value.frame.type === 'data');
    expect(frames.reduce((sum, value) => sum + (value.frame.type === 'data' ? value.frame.data.length : 0), 0))
      .toBe(STREAM_WINDOW_BYTES);
    const reverse = collect(left);
    const reverseWrite = right.write(Buffer.from('reverse')).then(() => right.end());
    const forward = collect(right);
    await vi.advanceTimersByTimeAsync(500);
    expect((await forward).equals(body)).toBe(true);
    expect((await reverse).toString()).toBe('reverse');
    await Promise.all([writing, reverseWrite]);
  } finally { connection.close(); }
});

it('recovers unacknowledged bytes after a path switch without delivering duplicate bytes', async () => {
  vi.useFakeTimers();
  const connection = pair();
  const [left, right] = connection.streams;
  const body = Buffer.from('path switch\0\xff'.repeat(10000));
  const received = collect(right);
  connection.drop(true);
  const writing = left.write(body).then(() => left.end());
  try {
    await vi.advanceTimersByTimeAsync(100);
    connection.drop(false); left.retry(); right.retry();
    await vi.advanceTimersByTimeAsync(200);
    expect((await received).equals(body)).toBe(true);
    await writing;
    const first = connection.sent.find(value => value.frame.type === 'data')!.frame;
    right.receive(first);
    expect((await right.read()).eof).toBe(true);
  } finally { connection.close(); }
});

it('reassembles reordered data and EOF, rejects oversized credit, and releases pending callers on close', async () => {
  const stream = new MappingByteStream({ reliable: () => false, send: async () => {}, closed: vi.fn() });
  try {
    stream.receive({ type: 'data', offset: 3, data: Buffer.from('def') });
    stream.receive({ type: 'end', offset: 6 });
    stream.receive({ type: 'data', offset: 0, data: Buffer.from('abc') });
    const result = await stream.read();
    expect(Buffer.from(result.data).toString()).toBe('abcdef');
    expect(result.eof).toBe(true);
    stream.receive({ type: 'ack', offset: 100, eof: false });
    await expect(stream.read()).rejects.toThrow('closed');
  } finally { stream.close(); }
  const idle = new MappingByteStream({ reliable: () => false, send: async () => {}, closed() {} });
  const waiting = expect(idle.read()).rejects.toThrow('closed');
  idle.close(); await waiting;
});

it('validates the binary stream envelope including offsets above 4 GiB', () => {
  const frame: StreamFrame = { type: 'data', offset: 2 ** 33 + 17, data: Uint8Array.of(0, 255) };
  expect(decodeStreamFrame(encodeStreamFrame(frame))).toEqual(frame);
  expect(() => decodeStreamFrame(Uint8Array.of(1))).toThrow();
  expect(() => encodeStreamFrame({ type: 'end', offset: -1 })).toThrow();
  expect(() => encodeStreamFrame({ type: 'data', offset: 0, data: new Uint8Array() })).toThrow();
});
