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
    phase: "downloading", elapsedSeconds: 1,
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
    phase: "preparing", elapsedSeconds: 1,
  });
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_000 } }, 2_000);
  expect(tracker.snapshot(2_500).bytesPerSecond).toBe(1_000);
});

it("reports bytes and speed without a content length, then finalizes the total", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: {} }, 0);
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 4_096 } }, 1_000)).toEqual({
    percent: null, downloadedBytes: 4_096, totalBytes: null, bytesPerSecond: 4_096,
    phase: "downloading", elapsedSeconds: 1,
  });
  expect(tracker.handleEvent({ event: "Finished" }, 1_100)).toEqual({
    percent: 100, downloadedBytes: 4_096, totalBytes: 4_096, bytesPerSecond: 0,
    phase: "finished", elapsedSeconds: 1,
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
  expect(report).toHaveBeenCalledTimes(5);
  expect(report).toHaveBeenNthCalledWith(4, null, expect.objectContaining({
    downloadedBytes: 102_400, bytesPerSecond: 102_400,
  }));
  expect(report).toHaveBeenLastCalledWith(100, expect.objectContaining({ downloadedBytes: 102_400 }));
});

it("keeps feedback alive before the first native event and clears it on connection failure", async () => {
  vi.useFakeTimers();
  let fail!: (error: Error) => void;
  const update = {
    download: () => new Promise<void>((_resolve, reject) => { fail = reject; }),
  } as Update;
  const report = vi.fn();
  const downloading = downloadWithAppUpdateProgress(update, report);
  const result = expect(downloading).rejects.toThrow("connection failed");
  expect(report).toHaveBeenLastCalledWith(null, expect.objectContaining({
    phase: "preparing", elapsedSeconds: 0, downloadedBytes: 0,
  }));
  await vi.advanceTimersByTimeAsync(11_000);
  expect(report).toHaveBeenLastCalledWith(null, expect.objectContaining({
    phase: "waiting", elapsedSeconds: 11, downloadedBytes: 0,
  }));
  fail(new Error("connection failed"));
  await result;
  expect(vi.getTimerCount()).toBe(0);
});

it("limits renders during a burst of percentage changes without delaying phase changes", async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const update = {
    download: async (send: (event: DownloadEvent) => void) => {
      send({ event: "Started", data: { contentLength: 100_000 } });
      for (let chunk = 0; chunk < 90; chunk += 1) {
        send({ event: "Progress", data: { chunkLength: 1_000 } });
      }
      expect(report).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(report).toHaveBeenLastCalledWith(90, expect.objectContaining({ downloadedBytes: 90_000 }));
      send({ event: "Progress", data: { chunkLength: 10_000 } });
      expect(report).toHaveBeenLastCalledWith(100, expect.objectContaining({ phase: "finishing" }));
      send({ event: "Finished" });
    },
  } as Update;
  await downloadWithAppUpdateProgress(update, report);
  expect(report).toHaveBeenCalledTimes(6);
});

it("shows small transfers, detects a pause, and resumes without inventing progress", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: { contentLength: 1_000_000 } }, 0);
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_000 } }, 1_000))
    .toMatchObject({ percent: 0.1, phase: "downloading" });
  expect(tracker.snapshot(11_000)).toMatchObject({ percent: 0.1, phase: "waiting", bytesPerSecond: 0 });
  // An empty progress event is not evidence that data is arriving again.
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 0 } }, 12_000).phase).toBe("waiting");
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 1_000 } }, 13_000))
    .toMatchObject({ percent: 0.2, phase: "downloading", elapsedSeconds: 13 });
});

it("distinguishes final preparation from a stalled download and never rounds up to completion", () => {
  const tracker = new AppUpdateProgressTracker();
  tracker.handleEvent({ event: "Started", data: { contentLength: 10_000 } }, 0);
  expect(tracker.handleEvent({ event: "Progress", data: { chunkLength: 9_999 } }, 1_000))
    .toMatchObject({ percent: 99.9, phase: "downloading" });
  tracker.handleEvent({ event: "Progress", data: { chunkLength: 1 } }, 2_000);
  expect(tracker.snapshot(20_000)).toMatchObject({ percent: 100, phase: "finishing", elapsedSeconds: 20 });
  expect(tracker.handleEvent({ event: "Started", data: {} }, 21_000))
    .toMatchObject({ percent: null, phase: "preparing", downloadedBytes: 0, elapsedSeconds: 21 });
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
