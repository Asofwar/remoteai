import { expect, it } from 'vitest';
import { normalizeFileError, filePreviewError } from '../../../../shared/remote-chat/fileErrors';
import { canRetryDownload } from '../../../../shared/remote-chat/downloadRetry';
import { BulkError } from '../../../../shared/remote-chat/bulkLimits';

it.each([
  ['文件暂时无法下载，请确认文件仍在当前项目中。', 'FILE_UNAVAILABLE'],
  ['文件暂时无法读取，请确认文件存在且有读取权限。', 'FILE_UNAVAILABLE'],
  ['文件暂时无法读取，请确认文件仍在当前项目中，且大小未超过查看上限。', 'PREVIEW_UNAVAILABLE'],
  ['文件超过当前传输大小上限。', 'FILE_TOO_LARGE'],
])('does not reconnect or automatically retry a rejected file: %s', (message, code) => {
  const error = normalizeFileError(new Error(message));
  expect(error).toBeInstanceOf(BulkError);
  expect(error).toMatchObject({ code });
  expect(canRetryDownload(error)).toBe(false);
  expect(filePreviewError(error, 'fallback')).not.toBe('fallback');
});

it('keeps persisted file failures visible without exposing arbitrary exception details', () => {
  const message = new BulkError('FILE_UNAVAILABLE').message;
  expect(filePreviewError(new Error(message), 'fallback')).toBe(message);
  expect(filePreviewError(new Error('secret path: C:/private'), 'fallback')).toBe('fallback');
  expect(canRetryDownload(new BulkError('PATH_UNAVAILABLE'))).toBe(true);
});
