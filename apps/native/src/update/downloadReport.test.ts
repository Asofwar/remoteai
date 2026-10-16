import { afterEach, expect, it, vi } from 'vitest';
import { reportDownload, type DownloadReport } from '../../../../shared/app-update/downloadReport';

const report: DownloadReport = { id: 'test-id', artifact: 'a'.repeat(64), platform: 'android',
  outcome: 'success', peerBytes: 10, serverBytes: 20, originBytes: 0, failures: [] };
const session = { baseUrl: 'https://example.test', accessToken: 'captured-session' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('retries the same report and captured identity after a lost response', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const pending = reportDownload(session, report);
  await vi.runAllTimersAsync();
  await pending;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer captured-session');
});

it('stops retrying an unauthorized report without affecting the completed download', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(reportDownload(session, report)).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});
