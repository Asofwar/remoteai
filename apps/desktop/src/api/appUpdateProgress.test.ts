import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { afterEach, expect, it, vi } from "vitest";
import { AppUpdateProgressTracker, downloadWithAppUpdateProgress } from "./appUpdateProgress";

afterEach(() => vi.useRealTimers());

it("measures recent speed and drops to zero when no more bytes arrive", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: { contentLength: 10_000 } }, 0);
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 2_000 } }, 500);
  expect(tracker.snapshot(1_000)).toEqual({
    percent: 20, downloadedBytes: 2_000, totalBytes: 10_000, bytesPerSecond: 2_000,
  });
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_000 } }, 1_500);
  expect(tracker.snapshot(2_000).bytesPerSecond).toBe(1_000);
  expect(tracker.snapshot(3_000).bytesPerSecond).toBe(0);
});

it("resets byte counts and speed when a new download source starts", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: { contentLength: 10_000 } }, 0);
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 6_000 } }, 1_000);
  expect(tracker.handleEvent({ event: "Started", data: { contentLength: 20_000 } }, 1_500)).toEqual({
    percent: 0, downloadedBytes: 0, totalBytes: 20_000, bytesPerSecond: 0,
  });
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_000 } }, 2_000);
  expect(tracker.snapshot(2_500).bytesPerSecond).toBe(1_000);
});

it("reports bytes and speed without a content length, then finalizes the total", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: {} }, 0);
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 4_096 } }, 1_000)).toEqual({
    percent: null, downloadedBytes: 4_096, totalBytes: null, bytesPerSecond: 4_096,
  });
  expect(tracker.handleEvent({ event: "Finished" }, 1_100)).toEqual({
    percent: 100, downloadedBytes: 4_096, totalBytes: 4_096, bytesPerSecond: 0,
  });
});

it("coalesces small chunks while preserving the full byte count", async () => {
  vi.useFakeTimers();
  const update = {
    download: async (send: (event: DownloadEvent) => void) => {
      send({ event: "Started", data: {} });
      for (let chunk = 0; chunk < 100; chunk += 1) {
        send({ event: "Progress", data: { chunkLength: 1_024 } });
      }
      await vi.advanceTimersByTimeAsync(1_000);
      send({ event: "Finished" });
    },
  } as Update;
  const report = vi.fn();
  await downloadWithAppUpdateProgress(update, report);
  expect(report).toHaveBeenCalledTimes(3);
  expect(report).toHaveBeenNthCalledWith(2, null, expect.objectContaining({
    downloadedBytes: 102_400, bytesPerSecond: 102_400,
  }));
  expect(report).toHaveBeenLastCalledWith(100, expect.objectContaining({ downloadedBytes: 102_400 }));
});

it.each([false, true])("refreshes idle speed and releases timers after download (failure: %s)", async (fail) => {
  vi.useFakeTimers();
  let send!: (event: DownloadEvent) => void;
  let complete!: () => void;
  let reject!: (error: Error) => void;
  const update = {
    download: (onEvent: typeof send) => {
      send = onEvent;
      return new Promise<void>((resolve, failDownload) => { complete = resolve; reject = failDownload; });
    },
  } as Update;
  const report = vi.fn();
  const downloading = downloadWithAppUpdateProgress(update, report);
  const result = fail ? expect(downloading).rejects.toThrow("failed") : expect(downloading).resolves.toBeUndefined();
  send({ event: "Started", data: { contentLength: 8_192 } });
  send({ event: "Progress", data: { chunkLength: 4_096 } });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(report).toHaveBeenLastCalledWith(50, expect.objectContaining({ bytesPerSecond: 4_096 }));
  await vi.advanceTimersByTimeAsync(1_000);
  expect(report).toHaveBeenLastCalledWith(50, expect.objectContaining({ bytesPerSecond: 0 }));
  if (fail) reject(new Error("failed"));
  else { send({ event: "Finished" }); complete(); }
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
