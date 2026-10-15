import { expect, it } from 'vitest';
import { canRetryDownload, DownloadRetry } from '../../../../shared/remote-chat/downloadRetry';
import { BulkError } from '../../../../shared/remote-chat/bulkLimits';
import { DownloadCancelled } from '../../../../shared/remote-chat/fileDownload';
import { DownloadPolicyError } from '../../../../shared/remote-chat/policy';

it('retries five times per run and isolates tasks until explicitly resumed', () => {
  const retries = new DownloadRetry();
  expect(Array.from({ length: 7 }, () => retries.next('first')))
    .toEqual([1000, 2000, 4000, 8000, 16000, undefined, undefined]);
  expect(retries.next('second')).toBe(1000);
  retries.clear('first');
  expect(retries.next('first')).toBe(1000);
});

it('retries temporary failures without retrying cancellation, corruption, policy or full storage', () => {
  for (const error of [new Error('timeout'), new BulkError('PATH_UNAVAILABLE'),
    new BulkError('EPOCH_EXPIRED'), new BulkError('RESOURCE_LIMIT')]) expect(canRetryDownload(error)).toBe(true);
  for (const error of [new DownloadCancelled(), new DownloadPolicyError('denied'),
    new BulkError('INTEGRITY_FAILED'), new BulkError('REPLAY'), new BulkError('SOURCE_CHANGED'),
    new BulkError('STORAGE_FAILED'), new BulkError('CANCELLED'), new DOMException('full', 'QuotaExceededError')]) {
    expect(canRetryDownload(error)).toBe(false);
  }
});
