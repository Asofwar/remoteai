import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

const SPEED_SAMPLE_INTERVAL_MS = 1_000;
const PROGRESS_REPORT_INTERVAL_MS = 250;

export interface AppUpdateDownloadProgress {
  percent: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
}

export type AppUpdateProgressListener = (percent: number | null, details: AppUpdateDownloadProgress) => void;

/** Measures recent transfer speed, including time spent waiting for more data. */
export class AppUpdateProgressTracker {
  private downloadedBytes = 0;
  private totalBytes: number | null = null;
  private bytesPerSecond = 0;
  private sampleBytes = 0;
  private sampleTime = 0;
  private finished = false;

  handleEvent(event: DownloadEvent, now: number): AppUpdateDownloadProgress {
    if (event.event === "Started") {
      this.downloadedBytes = 0;
      this.totalBytes = event.data.contentLength || null;
      this.bytesPerSecond = 0;
      this.sampleBytes = 0;
      this.sampleTime = now;
      this.finished = false;
    } else if (event.event === "Progress") {
      this.downloadedBytes += event.data.chunkLength;
    } else {
      this.finished = true;
      this.totalBytes ??= this.downloadedBytes;
      this.downloadedBytes = this.totalBytes;
      this.bytesPerSecond = 0;
    }
    return this.snapshot(now);
  }

  snapshot(now: number): AppUpdateDownloadProgress {
    const elapsed = now - this.sampleTime;
    if (!this.finished && elapsed >= SPEED_SAMPLE_INTERVAL_MS) {
      this.bytesPerSecond = (this.downloadedBytes - this.sampleBytes) * 1_000 / elapsed;
      this.sampleBytes = this.downloadedBytes;
      this.sampleTime = now;
    }
    const percent = this.totalBytes
      ? Math.min(100, Math.round(this.downloadedBytes / this.totalBytes * 100)) : null;
    return {
      percent: this.finished ? 100 : percent,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      bytesPerSecond: this.bytesPerSecond,
    };
  }
}

export async function downloadWithAppUpdateProgress(update: Update, report: AppUpdateProgressListener): Promise<void> {
  const tracker = new AppUpdateProgressTracker();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastProgress: AppUpdateDownloadProgress | null = null;
  let lastReportTime = 0;
  const publish = (details: AppUpdateDownloadProgress, force = false) => {
    const now = performance.now();
    // Small chunks should not rerender the dashboard for every network event.
    if (!force && lastProgress?.percent === details.percent
      && lastProgress.bytesPerSecond === details.bytesPerSecond
      && now - lastReportTime < PROGRESS_REPORT_INTERVAL_MS) return;
    lastProgress = details;
    lastReportTime = now;
    report(details.percent, details);
  };
  try {
    await update.download((event) => {
      publish(tracker.handleEvent(event, performance.now()), event.event !== "Progress");
      if (event.event === "Started") {
        clearInterval(timer);
        timer = setInterval(() => publish(tracker.snapshot(performance.now())), SPEED_SAMPLE_INTERVAL_MS);
      } else if (event.event === "Finished") {
        clearInterval(timer);
      }
    });
  } finally {
    clearInterval(timer);
  }
}
