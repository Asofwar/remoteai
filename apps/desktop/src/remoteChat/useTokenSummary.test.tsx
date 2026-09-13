// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTokenSummary } from '../../../../shared/remote-chat/client/useTokenSummary';
import type { ReadTokenSummary, TokenSummary } from '../../../../shared/remote-chat/tokenSummary';

let root: Root;
let value: ReturnType<typeof useTokenSummary>;
const snapshot = (weeks = 4): TokenSummary => ({ weeks, refreshSeconds: 1, thresholdTokens: 128000,
  startTs: 0, endTs: 1, dateKeys: [], dailyUsage: [], breakdown: [], quotaHistory: [],
  rankings: { providers: [], models: [], accounts: [] }, entryCount: 0,
  errors: { usage: false, analytics: false, quota: false } });
function Harness({ read, active = true }: { read: ReadTokenSummary; active?: boolean }) {
  value = useTokenSummary({ read, active });
  return <button onClick={() => value.changeWeeks(1)}>最近一周</button>;
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });

it('keeps refresh single-flight and stops polling while inactive', async () => {
  let resolve!: (value: TokenSummary) => void;
  const read = vi.fn<ReadTokenSummary>(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Harness read={read} />));
  await act(async () => { value.refresh(); value.refresh(); await vi.advanceTimersByTimeAsync(120000); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => resolve(snapshot()));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => root.render(<Harness read={read} active={false} />));
  await act(async () => { resolve(snapshot()); await vi.advanceTimersByTimeAsync(120000); });
  expect(read).toHaveBeenCalledTimes(2);
  expect(value.loading).toBe(false);
});

it('allows navigation during a pending read and discards the old range before applying the latest choice', async () => {
  let finish!: (value: TokenSummary) => void;
  const read = vi.fn<ReadTokenSummary>().mockImplementationOnce(() => new Promise((done) => { finish = done; }))
    .mockResolvedValue(snapshot(1));
  await act(async () => root.render(<Harness read={read} />));
  await act(async () => value.changeWeeks(1));
  expect(value.weeks).toBe(1);
  expect(value.data).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => finish(snapshot(4)));
  expect(read).toHaveBeenLastCalledWith(1);
  expect(value.data?.weeks).toBe(1);
});

it('keeps errors safe and allows a retry', async () => {
  const read = vi.fn<ReadTokenSummary>().mockRejectedValueOnce(new Error('Bearer private-token'))
    .mockResolvedValue(snapshot());
  await act(async () => root.render(<Harness read={read} />));
  expect(value.error).toContain('暂时无法加载');
  expect(value.error).not.toContain('private-token');
  await act(async () => value.refresh());
  expect(value.error).toBe('');
  expect(value.data?.weeks).toBe(4);
});
