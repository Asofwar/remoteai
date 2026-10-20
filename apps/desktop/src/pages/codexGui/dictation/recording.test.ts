// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX_RECORDING_SECONDS, startRecording } from './recording';

class Recorder {
  static isTypeSupported = (mime: string) => mime.startsWith('audio/webm');
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recording'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('includes the final audio chunk and releases the microphone when stopped', async () => {
  const recording = await startRecording(new AbortController().signal);
  recording.stop();
  const audio = await recording.result;
  expect(audio.size).toBe(9);
  expect(audio.type).toBe('audio/webm');
  expect(stopTrack).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('automatically stops at the recording limit', async () => {
  const recording = await startRecording(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(MAX_RECORDING_SECONDS * 1000);
  expect((await recording.result).size).toBeGreaterThan(0);
  expect(stopTrack).toHaveBeenCalled();
});

it('discards cancelled audio and stops tracks', async () => {
  const recording = await startRecording(new AbortController().signal);
  recording.cancel();
  await expect(recording.result).rejects.toMatchObject({ name: 'AbortError' });
  expect(stopTrack).toHaveBeenCalled();
});

it('releases tracks granted by a permission prompt after cancellation', async () => {
  let grant!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    new Promise((resolve) => { grant = resolve; }));
  const abort = new AbortController();
  const recording = startRecording(abort.signal);
  abort.abort();
  grant(stream);
  await expect(recording).rejects.toMatchObject({ name: 'AbortError' });
  expect(stopTrack).toHaveBeenCalledOnce();
});
