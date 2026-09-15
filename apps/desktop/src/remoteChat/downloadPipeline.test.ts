import { afterEach, expect, it, vi } from 'vitest';
import { downloadFile, FILE_CHUNK_BYTES, type FileClient, type FileChunk, type FileRead }
  from '../../../../shared/remote-chat/fileDownload';
import { setChatConnectionMode } from '../../../../shared/remote-chat/policy';

afterEach(() => setChatConnectionMode('offline'));
function fixture() {
  setChatConnectionMode('direct');
  const pending: { offset: number; resolve: (chunk: FileChunk) => void; reject: (error: Error) => void }[] = [];
  const client: FileClient = { open: async () => ({ id: '01234567-0123-4123-8123-012345678901',
    name: 'file.bin', mimeType: 'application/octet-stream', size: FILE_CHUNK_BYTES * 6 }),
    read: vi.fn(({ offset }: FileRead) => new Promise<FileChunk>((resolve, reject) =>
      pending.push({ offset, resolve, reject }))),
    close: vi.fn(async () => undefined) };
  const target = { write: vi.fn(async (_data: string): Promise<void> => undefined),
    finish: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
  const abort = new AbortController();
  const run = () => downloadFile({ client, threadId: 'chat', path: 'file.bin', signal: abort.signal,
    progress: vi.fn(), target: async () => target });
  const resolve = (index: number) => pending[index].resolve({ offset: pending[index].offset,
    data: Buffer.alloc(FILE_CHUNK_BYTES, index).toString('base64') });
  return { pending, client, target, abort, run, resolve };
}

it('prefetches bounded P2P ranges but writes reordered responses in original file order', async () => {
  const task = fixture();
  const running = task.run();
  await vi.waitFor(() => expect(task.pending).toHaveLength(4));
  task.resolve(3); task.resolve(2); task.resolve(1);
  await Promise.resolve();
  expect(task.target.write).not.toHaveBeenCalled();
  task.resolve(0);
  await vi.waitFor(() => expect(task.pending).toHaveLength(6));
  task.resolve(5); task.resolve(4);
  await running;
  expect(task.target.write.mock.calls.map(([data]) => Buffer.from(data, 'base64')[0])).toEqual([0, 1, 2, 3, 4, 5]);
  expect(task.target.finish).toHaveBeenCalledOnce();
});

it('stops prefetching when disk writes are blocked, keeping memory bounded', async () => {
  const task = fixture();
  let release: () => void = () => undefined;
  task.target.write.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const running = task.run();
  const rejected = expect(running).rejects.toThrow();
  await vi.waitFor(() => expect(task.pending).toHaveLength(4));
  for (let index = 0; index < 4; index++) task.resolve(index);
  await vi.waitFor(() => expect(task.target.write).toHaveBeenCalledOnce());
  expect(task.pending).toHaveLength(4);
  task.abort.abort(); release();
  await rejected;
  expect(task.target.finish).not.toHaveBeenCalled();
  expect(task.target.dispose).toHaveBeenCalledOnce();
});

it('handles late failures of all outstanding reads after cancellation without retaining the file handle', async () => {
  const task = fixture();
  const running = task.run();
  const rejected = expect(running).rejects.toThrow();
  await vi.waitFor(() => expect(task.pending).toHaveLength(4));
  task.abort.abort(); task.resolve(0);
  await rejected;
  for (const read of task.pending.slice(1)) read.reject(new Error('closed'));
  await Promise.resolve();
  expect(task.client.read).toHaveBeenCalledTimes(4);
  expect(task.client.close).toHaveBeenCalledOnce();
  expect(task.target.write).not.toHaveBeenCalled();
});
