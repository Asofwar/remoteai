// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import * as backend from '../api/backend';
import { readTokenSummary } from './tokenSummary';
import { ChatOperations } from './operations';
import { LONG_CONTEXT_COST_STORAGE_KEY, DEFAULT_LONG_CONTEXT_COST_SETTINGS } from '../utils/tokenCostLongContext';

vi.mock('../api/backend', () => ({ loadAppSettings: vi.fn(), loadTokenUsageEntries: vi.fn(),
  loadDailyTokenUsage: vi.fn(), loadTokenUsageBreakdown: vi.fn(), loadAccountQuotaHistory: vi.fn(), invoke: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(backend.loadAppSettings).mockResolvedValue({ tokenUsageWeeks: 4, tokenUsageRefreshSeconds: 30,
    floatingBubbleEnabled: false, privacyMode: false, hideAccountNotes: false,
    bubbleResetDisplay: 'countdown', bubbleStyle: 'classic' });
  vi.mocked(backend.loadTokenUsageEntries).mockResolvedValue([
    { id: 'one', ts: 1, provider: 'Work', model: 'model', accountEmail: 'me@example.test', totalTokens: 100 },
    { id: 'two', ts: 2, provider: 'Work', model: 'model', accountId: 'account', inputTokens: 20, outputTokens: 30 },
  ]);
  vi.mocked(backend.loadDailyTokenUsage).mockResolvedValue([]);
  vi.mocked(backend.loadTokenUsageBreakdown).mockResolvedValue([]);
  vi.mocked(backend.loadAccountQuotaHistory).mockResolvedValue([]);
});

it('uses PC preferences, threshold, range and ranking semantics through remote RPC', async () => {
  localStorage.setItem(LONG_CONTEXT_COST_STORAGE_KEY, JSON.stringify({
    ...DEFAULT_LONG_CONTEXT_COST_SETTINGS, thresholdTokens: 128000,
  }));
  const operations = new ChatOperations();
  const request = { kind: 'request' as const, id: 'summary', method: 'request' as const,
    body: { operation: 'tokenSummary' } };
  const response = await operations.execute(request);
  expect(response.error).toBeUndefined();
  expect(response.data).toMatchObject({ weeks: 4, refreshSeconds: 30, thresholdTokens: 128000,
    entryCount: 2, rankings: { providers: [['Work', 150]], models: [['model', 150]],
      accounts: [['me@example.test', 100], ['account', 50]] },
    errors: { usage: false, analytics: false, quota: false } });
  expect(backend.loadTokenUsageEntries).toHaveBeenCalledWith();
  expect(backend.loadTokenUsageBreakdown).toHaveBeenCalledWith(expect.any(Number), 128000);
  expect(await operations.execute(request)).toEqual(response);
  expect(backend.loadTokenUsageEntries).toHaveBeenCalledTimes(1);
});

it.each([null, 0, 53, 1.5, '4', {}, Number.NaN])('rejects invalid range %j before loading', async (weeks) => {
  await expect(readTokenSummary(weeks)).rejects.toThrow('请选择');
  expect(backend.loadAppSettings).not.toHaveBeenCalled();
});

it('allows a phone range without changing PC preferences and retains successful sections on partial failure', async () => {
  vi.mocked(backend.loadTokenUsageBreakdown).mockRejectedValue(new Error('private path'));
  const summary = await readTokenSummary(1);
  expect(summary.weeks).toBe(1);
  expect(summary.dateKeys.length).toBeLessThanOrEqual(7);
  expect(summary.rankings.providers).toEqual([['Work', 150]]);
  expect(summary.errors).toEqual({ usage: false, analytics: true, quota: false });
  expect(JSON.stringify(summary)).not.toContain('private path');
});
