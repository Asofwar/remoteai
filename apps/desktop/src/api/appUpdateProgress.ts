import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

const SPEED_SAMPLE_INTERVAL_MS = 1_000;
const PROGRESS_REPORT_INTERVAL_MS = 250;
const DOWNLOAD_WAIT_THRESHOLD_MS = 10_000;

export type AppUpdateDownloadPhase = "preparing" | "downloading" | "waiting" | "finishing" | "finished";

export interface AppUpdateDownloadProgress {
  percent: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
  phase: AppUpdateDownloadPhase;
  elapsedSeconds: number;
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
  private lastDataTime: number;

  constructor(private readonly startedAt = 0) {
    this.sampleTime = startedAt;
    this.lastDataTime = startedAt;
  }

  handleEvent(event: DownloadEvent, now: number): AppUpdateDownloadProgress {
    if (event.event === "Started") {
      this.downloadedBytes = 0;
      this.totalBytes = event.data.contentLength || null;
      this.bytesPerSecond = 0;
      this.sampleBytes = 0;
      this.sampleTime = now;
      this.lastDataTime = now;
      this.finished = false;
    } else if (event.event === "Progress") {
      this.downloadedBytes += event.data.chunkLength;
      if (event.data.chunkLength > 0) this.lastDataTime = now;
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
      ? Math.min(100, Math.floor(this.downloadedBytes / this.totalBytes * 1_000) / 10) : null;
    return {
      percent: this.finished ? 100 : percent,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      bytesPerSecond: this.bytesPerSecond,
      phase: this.phase(now),
      elapsedSeconds: Math.max(0, Math.floor((now - this.startedAt) / 1_000)),
    };
  }

  private phase(now: number): AppUpdateDownloadPhase {
    if (this.finished) return "finished";
    if (this.totalBytes && this.downloadedBytes >= this.totalBytes) return "finishing";
    if (now - this.lastDataTime >= DOWNLOAD_WAIT_THRESHOLD_MS) return "waiting";
    return this.downloadedBytes > 0 ? "downloading" : "preparing";
  }
}

export async function downloadWithAppUpdateProgress(update: Update, report: AppUpdateProgressListener): Promise<void> {
  const tracker = new AppUpdateProgressTracker(performance.now());
  let lastProgress: AppUpdateDownloadProgress | null = null;
  let lastReportTime = 0;
  const publish = (details: AppUpdateDownloadProgress, force = false) => {
    const now = performance.now();
    // Small chunks should not rerender the dashboard for every network event.
    if (!force && lastProgress?.percent === details.percent
      && lastProgress.phase === details.phase
      && lastProgress.bytesPerSecond === details.bytesPerSecond
      && now - lastReportTime < PROGRESS_REPORT_INTERVAL_MS) return;
    lastProgress = details;
    lastReportTime = now;
    report(details.percent, details);
  };
  // Peer discovery and connecting to the server can happen before the first native event.
  publish(tracker.snapshot(performance.now()), true);
  const timer = setInterval(() => publish(tracker.snapshot(performance.now())), SPEED_SAMPLE_INTERVAL_MS);
  try {
    await update.download((event) => {
      publish(tracker.handleEvent(event, performance.now()), event.event !== "Progress");
      if (event.event === "Finished") clearInterval(timer);
    });
  } finally {
    clearInterval(timer);
  }
}
