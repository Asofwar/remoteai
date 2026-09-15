import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  appState: {
    currentState: 'active',
    addEventListener: vi.fn(),
  },
  remove: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: mocks.appState }));
vi.mock('./telemetry', () => ({ reportMobileActivity: mocks.report }));
import { startMobileTelemetry } from './useMobileTelemetry';

beforeEach(() => {
  vi.useFakeTimers();
  mocks.appState.currentState = 'active';
  mocks.report.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset();
  mocks.appState.addEventListener.mockReset().mockReturnValue({ remove: mocks.remove });
});
afterEach(() => { vi.useRealTimers(); });

describe('mobile foreground activity lifecycle', () => {
  it('checks for a new day in the foreground, pauses in background and removes subscriptions', async () => {
    const stop = startMobileTelemetry('https://example.test');
    expect(mocks.report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.report).toHaveBeenCalledTimes(2);
    mocks.appState.currentState = 'background';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.report).toHaveBeenCalledTimes(2);
    mocks.appState.currentState = 'active';
    mocks.appState.addEventListener.mock.calls[0][1]('active');
    expect(mocks.report).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.report).toHaveBeenCalledTimes(3);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it('skips overlapping ticks and retries a failed request', async () => {
    let rejectReport: (error: Error) => void = () => undefined;
    mocks.report.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectReport = reject; }));
    const stop = startMobileTelemetry('https://example.test');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.report).toHaveBeenCalledOnce();
    rejectReport(new Error('offline'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.report).toHaveBeenCalledTimes(2);
    stop();
  });
});
