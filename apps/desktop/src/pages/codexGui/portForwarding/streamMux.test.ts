import { afterEach, expect, it, vi } from 'vitest';
import { BulkCipher } from '../../../../../../shared/remote-chat/bulkCipher';
import { BulkTransport, type BinaryChannel } from '../../../../../../shared/remote-chat/bulkTransport';
import { MappingStreamMux, STREAM_MANIFEST } from '../../../../../../shared/port-mapping/streamMux';
import type { MappingByteStream } from '../../../../../../shared/port-mapping/stream';

const identity = { transferId: '11111111-1111-4111-8111-111111111111', epoch: '22222222-2222-4222-8222-222222222222' };
const SOCKET = '33333333-3333-4333-8333-333333333333';
afterEach(() => vi.useRealTimers());

function cipher(desktop: boolean) {
  return new BulkCipher(new Uint8Array(32).fill(7), {
    ...identity, manifestId: STREAM_MANIFEST, sessionId: 'paired', desktopKey: 'host', clientKey: 'viewer', desktop,
  });
}

function fixture(latency = 30) {
  const transports: BulkTransport[] = [];
  const receivers: ((bytes: Uint8Array) => void)[] = [];
  const wire: Uint8Array[] = [];
  let direct = true;
  let recordLimit = 16 * 1024;
  for (let side = 0; side < 2; side++) {
    transports.push(new BulkTransport({ available: () => true, send: async bytes => {
      wire.push(bytes); setTimeout(() => transports[1 - side].receive(bytes, 'relay'), latency);
    } }));
    const channel: BinaryChannel = {
      get maxRecordBytes() { return recordLimit; },
      readyState: 'open', bufferedAmount: 0,
      send: bytes => { wire.push(bytes); if (direct) setTimeout(() => receivers[1 - side](bytes), 30); },
      close() {}, onLow: () => () => {}, onClose() {}, onMessage: receive => { receivers[side] = receive; },
    };
    transports[side].attach(channel); transports[side].setMode('direct');
  }
  const muxes = transports.map((transport, side) => new MappingStreamMux({ transport, cipher: cipher(side === 0), identity }));
  const streams = muxes.map(mux => mux.open(SOCKET, () => {}));
  return { streams, wire, transports,
    shrink: (limit: number) => { recordLimit = limit; streams.forEach(stream => stream.retry()); },
    switchPath: () => {
    direct = false; transports.forEach(transport => transport.setMode('relay'));
  }, close: () => { muxes.forEach(mux => mux.close()); transports.forEach(transport => transport.close()); } };
}

async function collect(stream: MappingByteStream) {
  const parts: Uint8Array[] = [];
  for (;;) {
    const result = await stream.read(); parts.push(result.data);
    if (result.eof) return Buffer.concat(parts);
  }
}

it('sends relay payloads once when delivery and consumption exceed the UDP retry interval', async () => {
  vi.useFakeTimers();
  const connection = fixture(1000);
  connection.switchPath();
  const body = Buffer.alloc(128 * 1024, 19);
  const sending = connection.streams[0].write(body).then(() => connection.streams[0].end());
  try {
    await vi.advanceTimersByTimeAsync(3000);
    const payloadRecords = connection.wire.filter(record => record.length > 100).length;
    expect(payloadRecords).toBe(9);
    const received = collect(connection.streams[1]);
    await vi.advanceTimersByTimeAsync(1200);
    expect((await received).equals(body)).toBe(true);
    await sending;
    expect(connection.wire.filter(record => record.length > 100)).toHaveLength(payloadRecords);
  } finally { connection.close(); }
});

it('carries encrypted streaming bytes across P2P to relay without reopening the TCP stream', async () => {
  vi.useFakeTimers();
  const connection = fixture();
  const body = Buffer.alloc(4 * 1024 * 1024, 0xa7);
  const received = collect(connection.streams[1]);
  const sending = connection.streams[0].write(body).then(() => connection.streams[0].end());
  try {
    await vi.advanceTimersByTimeAsync(35);
    connection.switchPath();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await received).equals(body)).toBe(true);
    await sending;
    expect(connection.wire.every(bytes => bytes.length <= 16 * 1024)).toBe(true);
    expect(connection.wire.some(bytes => Buffer.from(bytes).includes(body.subarray(0, 100)))).toBe(false);
  } finally { connection.close(); }
});

it('reframes unacknowledged bytes when a path limit shrinks, including overlapping late records', async () => {
  vi.useFakeTimers();
  const connection = fixture();
  const body = Buffer.alloc(4 * 1024 * 1024, 39);
  const received = collect(connection.streams[1]);
  const sending = connection.streams[0].write(body).then(() => connection.streams[0].end());
  try {
    await vi.advanceTimersByTimeAsync(10);
    connection.shrink(4096);
    const previous = connection.wire.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect((await received).equals(body)).toBe(true);
    await sending;
    expect(connection.wire.slice(previous).every(record => record.length <= 4096)).toBe(true);
  } finally { connection.close(); }
});

it('authenticates reordered stream records, ignores exact replay, and rejects a forged record', () => {
  const sender = cipher(true), receiver = cipher(false);
  const first = sender.encrypt({ requestId: SOCKET, block: 0, offset: 0 }, Uint8Array.of(1));
  const second = sender.encrypt({ requestId: SOCKET, block: 0, offset: 0 }, Uint8Array.of(2));
  try {
    expect(receiver.decryptStream(second)?.bytes).toEqual(Uint8Array.of(2));
    expect(receiver.decryptStream(first)?.bytes).toEqual(Uint8Array.of(1));
    expect(receiver.decryptStream(first)).toBeUndefined();
    const forged = sender.encrypt({ requestId: SOCKET, block: 0, offset: 0 }, Uint8Array.of(3));
    forged[forged.length - 1] ^= 1;
    expect(() => receiver.decryptStream(forged)).toThrow();
  } finally { sender.destroy(); receiver.destroy(); }
});

it('keeps an encrypted file download and duplex port bytes isolated on the same binary channel', async () => {
  vi.useFakeTimers();
  const connection = fixture();
  const file = { transferId: '44444444-4444-4444-8444-444444444444', epoch: identity.epoch,
    manifestId: 'file-manifest', sessionId: 'paired', desktopKey: 'host', clientKey: 'viewer' };
  const sender = new BulkCipher(new Uint8Array(32).fill(7), { ...file, desktop: true });
  const receiver = new BulkCipher(new Uint8Array(32).fill(7), { ...file, desktop: false });
  const fileParts: Uint8Array[] = [], failed = vi.fn();
  const release = connection.transports[1].listen(file.transferId, { epoch: file.epoch, path: 'direct', failed,
    record: record => fileParts.push(receiver.decrypt(record).bytes) });
  const body = Buffer.alloc(4 * 1024 * 1024, 91), upload = Buffer.alloc(128 * 1024, 83);
  const downloading = collect(connection.streams[1]), uploading = collect(connection.streams[0]);
  const fileBody = Buffer.alloc(1024 * 1024, 47);
  const sendFile = async () => {
    const size = 8 * 1024;
    for (let offset = 0; offset < fileBody.length; offset += size) {
      const record = sender.encrypt({ requestId: SOCKET, block: 0, offset }, fileBody.subarray(offset, offset + size));
      await connection.transports[0].send(record, 'direct', new AbortController().signal);
    }
  };
  try {
    const sent = Promise.all([sendFile(),
      connection.streams[0].write(body).then(() => connection.streams[0].end()),
      connection.streams[1].write(upload).then(() => connection.streams[1].end())]);
    await vi.advanceTimersByTimeAsync(1000);
    await sent;
    expect((await downloading).equals(body)).toBe(true);
    expect((await uploading).equals(upload)).toBe(true);
    expect(Buffer.concat(fileParts).equals(fileBody)).toBe(true);
    expect(failed).not.toHaveBeenCalled();
  } finally { release(); sender.destroy(); receiver.destroy(); connection.close(); }
});
