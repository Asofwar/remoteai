import { reportDownload, type DownloadReport } from '../../../../shared/app-update/downloadReport';
import type { UpdatePeerSession } from '../../../../shared/app-update/peerLookup';

const MAX_FAILURES = 16;
const MAX_FAILURE_COUNT = 1000;

/** Keep the original account and report ID until all sources and final verification have finished. */
export class AndroidDownloadReporting {
  private pending?: { session: UpdatePeerSession; report: DownloadReport };
  private origin = false;
  private verifying = false;

  constructor(private readonly size: number) {}

  capture(session: UpdatePeerSession, report: DownloadReport) { this.pending = { session, report }; }
  useOrigin() { this.origin = true; }
  verify() { this.verifying = true; }

  finish(success: boolean) {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    const { session, report } = pending;
    report.outcome = success ? 'success' : 'failed';
    if (success && this.origin) report.originBytes += this.size;
    if (!success) this.failure(report);
    void reportDownload(session, report);
  }

  private failure(report: DownloadReport) {
    if (!this.origin && report.failures.some(item => item.source === 'download')) return;
    const failure = { source: this.origin ? 'origin' : 'download',
      stage: this.verifying ? 'verify' : 'transfer', code: this.verifying ? 'invalid' : 'unavailable', count: 1 };
    const existing = report.failures.find(item => item.source === failure.source
      && item.stage === failure.stage && item.code === failure.code);
    if (existing) existing.count = Math.min(MAX_FAILURE_COUNT, existing.count + 1);
    else if (report.failures.length < MAX_FAILURES) report.failures.push(failure);
  }
}
