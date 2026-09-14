import { afterEach, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import { DEFAULT_CHAT_POLICY, setChatPolicy, MIB } from '../../../../../shared/remote-chat/policy';
import { isVideoPath, validateVideoInfo, VIDEO_CHUNK_BYTES } from '../../../../../shared/remote-chat/video';
import { videoHeaders, videoRange, videoRequest } from './videoHttp';
import { videoRangeStream } from './videoRangeStream';

const info = { id: '12345678-1234-4234-a234-123456789012', size: 3 * VIDEO_CHUNK_BYTES,
  mimeType: 'video/mp4' as const };
afterEach(() => setChatPolicy(DEFAULT_CHAT_POLICY));

it.each(['F:/project/movie.mp4', 'video.MOV', '/tmp/file.webm', './clip.m4v'])('recognizes video links: %s',
  (path) => expect(isVideoPath(path)).toBe(true));
it('validates metadata while allowing videos larger than the previous 1 GB cap', () => {
  expect(isVideoPath('movie.mp4.txt')).toBe(false);
  expect(validateVideoInfo({ ...info, size: 2 ** 40 }).size).toBe(2 ** 40);
  expect(() => validateVideoInfo({ ...info, size: Infinity })).toThrow();
  expect(() => validateVideoInfo({ ...info, id: '../other' })).toThrow();
});

it('supports initial, seek, suffix and EOF byte ranges', () => {
  expect(videoRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
  expect(videoRange('bytes=30-', 100)).toEqual({ start: 30, end: 99, partial: true });
  expect(videoRange('bytes=-2', 100)).toEqual({ start: 98, end: 99, partial: true });
  expect(videoRange('bytes=80-200', 100)).toEqual({ start: 80, end: 99, partial: true });
  expect(videoHeaders({ ...info, size: 100 }, videoRange('bytes=20-29', 100)!))
    .toContain('Content-Range: bytes 20-29/100');
});
it.each(['bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=1e2-', 'bytes=Infinity-'])(
  'rejects invalid or multipart ranges: %s', (range) => expect(videoRange(range, 100)).toBeUndefined());
it('requires the exact random capability and read-only HTTP methods', () => {
  expect(videoRequest('GET /' + info.id + ' HTTP/1.1\r\nRange: bytes=1-2', info.id))
    .toEqual({ head: false, range: 'bytes=1-2' });
  expect(videoRequest('POST /' + info.id + ' HTTP/1.1', info.id)).toBeUndefined();
  expect(videoRequest('GET /other HTTP/1.1', info.id)).toBeUndefined();
  expect(videoRequest('GET /' + info.id + ' HTTP/1.1\r\nRange: bytes=0-\r\nRange: bytes=1-', info.id))
    .toBeUndefined();
});
it('waits for consumption before requesting the next chunk and cancels without another read', async () => {
  const read = vi.fn(async (offset: number, length: number) =>
    ({ offset, data: Buffer.alloc(length).toString('base64') }));
  const abort = new AbortController();
  const stream = videoRangeStream({ info, read }, videoRange(undefined, info.size)!, abort.signal);
  expect(read).not.toHaveBeenCalled();
  expect((await stream.next()).value).toHaveLength(VIDEO_CHUNK_BYTES);
  expect(read).toHaveBeenCalledTimes(1);
  abort.abort();
  expect((await stream.next()).done).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
});
it('discards a pending read after cancellation', async () => {
  const abort = new AbortController();
  const read = vi.fn(async (offset: number, length: number) => {
    abort.abort();
    return { offset, data: Buffer.alloc(length).toString('base64') };
  });
  const stream = videoRangeStream({ info, read }, videoRange(undefined, info.size)!, abort.signal);
  expect((await stream.next()).done).toBe(true);
});
it('enforces changed admin limits between chunks', async () => {
  const largeInfo = { ...info, size: 2 * MIB };
  const read = vi.fn(async (offset: number, length: number) =>
    ({ offset, data: Buffer.alloc(length).toString('base64') }));
  const stream = videoRangeStream({ info: largeInfo, read }, videoRange(undefined, largeInfo.size)!,
    new AbortController().signal);
  await stream.next();
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, videoPreviewMaxMb: 1 });
  await expect(stream.next()).rejects.toThrow('1 MB');
  expect(read).toHaveBeenCalledTimes(1);
});
it.each([{ offset: 1, data: 'AAAA' }, { offset: 0, data: '????' }, { offset: 0, data: 'AA==' }])(
  'rejects corrupt or mismatched chunk responses: %o', async (chunk) => {
    const stream = videoRangeStream({ info, read: async () => chunk },
      { start: 0, end: 2, partial: true }, new AbortController().signal);
    await expect(stream.next()).rejects.toThrow('视频加载中断');
  });
