import { afterEach, expect, it, vi } from 'vitest';
import { openPreparedDownload, archivePercent, type ArchivePreparation, type ArchiveProgress }
  from '../../../../shared/remote-chat/archiveDownload';
import { DownloadCancelled } from '../../../../shared/remote-chat/fileDownload';
import { projectDownloads } from '../../../../shared/project-browser/downloads';

const options = { transferId: 'task', scope: 'computer' as const, path: 'F:/dist' };
const progress: ArchiveProgress = { phase: 'compressing', processedBytes: 5, totalBytes: 10,
  completedFiles: 0, totalFiles: 1 };
const pending: ArchivePreparation = { preparationId: '11111111-1111-4111-8111-111111111111', progress };
const file = { id: '22222222-2222-4222-8222-222222222222', name: 'dist.zip', size: 10, mimeType: 'application/zip' };
afterEach(() => vi.useRealTimers());

it('keeps compression alive beyond the ordinary RPC timeout and returns the downloadable file', async () => {
  vi.useFakeTimers();
  const open = vi.fn().mockResolvedValue(pending);
  const close = vi.fn();
  const update = vi.fn();
  const result = openPreparedDownload({ open, close }, options, { progress: update });
  await vi.advanceTimersByTimeAsync(65_000);
  expect(update).toHaveBeenCalledWith(progress);
  expect(open).toHaveBeenLastCalledWith({ ...options, preparationId: pending.preparationId });
  open.mockResolvedValue(file);
  await vi.advanceTimersByTimeAsync(500);
  await expect(result).resolves.toEqual(file);
  expect(close).not.toHaveBeenCalled();
});

it('does not overlap polls while a response is pending', async () => {
  vi.useFakeTimers();
  const open = vi.fn().mockResolvedValueOnce(pending).mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const result = openPreparedDownload({ open, close: vi.fn().mockResolvedValue(null) }, options,
    { signal: controller.signal });
  const rejected = expect(result).rejects.toBeInstanceOf(DownloadCancelled);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(open).toHaveBeenCalledTimes(2);
  controller.abort();
  await rejected;
});

it('cancels promptly during compression and releases the pending job', async () => {
  vi.useFakeTimers();
  const close = vi.fn().mockResolvedValue(null);
  const controller = new AbortController();
  const result = openPreparedDownload({ open: vi.fn().mockResolvedValue(pending), close }, options,
    { signal: controller.signal });
  const rejected = expect(result).rejects.toBeInstanceOf(DownloadCancelled);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejected;
  expect(close).toHaveBeenCalledWith('task', pending.preparationId);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([pending, file])('releases a late reply after cancelling the first request', async reply => {
  let resolve!: (value: typeof reply) => void;
  const open = vi.fn(() => new Promise<typeof reply>(done => { resolve = done; }));
  const close = vi.fn().mockResolvedValue(null);
  const controller = new AbortController();
  const result = openPreparedDownload({ open, close }, options, { signal: controller.signal });
  const rejected = expect(result).rejects.toBeInstanceOf(DownloadCancelled);
  controller.abort();
  await rejected;
  resolve(reply);
  await Promise.resolve();
  expect(close).toHaveBeenCalledWith('task', 'preparationId' in reply ? reply.preparationId : reply.id);
});

it('accepts ordinary files and older hosts without polling', async () => {
  const request = vi.fn().mockResolvedValue(file);
  await expect(projectDownloads(request).open(options)).resolves.toEqual(file);
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ prepare: true, operation: 'downloadOpen' }));
});

it('reports single-file bytes and empty-folder progress accurately', () => {
  expect(archivePercent(progress)).toBe(50);
  expect(archivePercent({ ...progress, phase: 'scanning' })).toBeUndefined();
  expect(archivePercent({ ...progress, totalBytes: 0, processedBytes: 0, totalFiles: 0 })).toBe(100);
});

it('releases the job after a failed poll', async () => {
  vi.useFakeTimers();
  const open = vi.fn().mockResolvedValueOnce(pending).mockRejectedValueOnce(new Error('offline'));
  const close = vi.fn().mockResolvedValue(null);
  const result = expect(openPreparedDownload({ open, close }, options)).rejects.toThrow('offline');
  await vi.advanceTimersByTimeAsync(500);
  await result;
  expect(close).toHaveBeenCalledWith('task', pending.preparationId);
});
