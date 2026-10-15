import { afterEach, expect, it, vi } from 'vitest';
import { StreamBudget } from '../../../../../../shared/port-mapping/streamBudget';

afterEach(() => vi.useRealTimers());

it('serves queued mappings in order and releases each reservation only once', async () => {
  const budget = new StreamBudget(1);
  const signal = new AbortController().signal;
  const release = await budget.acquire(signal);
  const first = vi.fn(); const second = vi.fn();
  const queuedFirst = budget.acquire(signal).then(value => { first(); return value; });
  const queuedSecond = budget.acquire(signal).then(value => { second(); return value; });
  release!(); release!();
  const releaseFirst = await queuedFirst;
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(budget.active).toBe(1);
  releaseFirst!(); (await queuedSecond)!();
  expect(budget.active).toBe(0);
});

it('cancels a stopped mapping without consuming another mapping’s next slot', async () => {
  const budget = new StreamBudget(1);
  const first = new AbortController(); const second = new AbortController();
  const release = await budget.acquire(first.signal);
  const stopped = budget.acquire(first.signal);
  const waiting = budget.acquire(second.signal);
  first.abort();
  expect(await stopped).toBeUndefined();
  expect(await budget.acquire(first.signal)).toBeUndefined();
  expect(budget.active).toBe(1);
  release!(); (await waiting)!();
  expect(budget.active).toBe(0);
});

it('bounds queue length and expires waiting sockets without leaking timers or capacity', async () => {
  vi.useFakeTimers();
  const budget = new StreamBudget(1);
  const abort = new AbortController();
  const release = await budget.acquire(abort.signal);
  const waiting = Array.from({ length: 128 }, () => budget.acquire(new AbortController().signal));
  expect(await budget.acquire(abort.signal)).toBeUndefined();
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await Promise.all(waiting)).every(value => value === undefined)).toBe(true);
  release!(); (await budget.acquire(abort.signal))!();
  expect(budget.active).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
