import { expect, it, vi } from 'vitest';
import { PromptSuggestionCache, type PromptSuggestionStorage } from '../../../../shared/chat/promptSuggestionCache';

const target = { threadId: 'thread', sourceTurnId: 'turn', model: 'model', effort: 'low' as const };
const key = JSON.stringify([target.threadId, target.sourceTurnId]);
function storage() {
  const saved = new Map<string, string>();
  return { getItem: vi.fn(async (key: string) => saved.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { saved.set(key, value); }) };
}

it('persists a suggestion across cache instances and isolates accounts and devices', async () => {
  const disk = storage();
  const request = vi.fn().mockResolvedValue({ suggestion: '继续实现' });
  const first = new PromptSuggestionCache(disk, 'account:device');
  await first.load(); await first.request(key, target, request);
  const restored = new PromptSuggestionCache(disk, 'account:device');
  await restored.load(); await restored.request(key, target, request);
  expect(restored.get(key)).toBe('继续实现'); expect(request).toHaveBeenCalledOnce();
  const other = new PromptSuggestionCache(disk, 'other-account:device');
  await other.load(); expect(other.get(key)).toBe('');
  expect(restored.get(JSON.stringify(['thread', 'next-turn']))).toBe('');
});

it('shares an outstanding request for the same turn', async () => {
  let finish!: (response: { suggestion: string }) => void;
  const request = vi.fn(() => new Promise<{ suggestion: string }>(resolve => { finish = resolve; }));
  const cache = new PromptSuggestionCache(storage(), 'local');
  await cache.load();
  const first = cache.request(key, target, request);
  const second = cache.request(key, target, request);
  expect(first).toBe(second); finish({ suggestion: '继续实现' });
  await first; expect(request).toHaveBeenCalledOnce(); expect(cache.get(key)).toBe('继续实现');
});

it('keeps predictions usable when storage is corrupt or unavailable', async () => {
  const disk: PromptSuggestionStorage = { getItem: () => 'broken json',
    setItem: () => { throw new Error('disk full'); } };
  const cache = new PromptSuggestionCache(disk, 'local');
  await cache.load(); await cache.request(key, target, async () => ({ suggestion: '继续实现' }));
  expect(cache.get(key)).toBe('继续实现');
});

it('rejects invalid saved suggestions and retries neither failed nor empty predictions within a session', async () => {
  const disk = storage();
  disk.getItem.mockResolvedValue(JSON.stringify([[key, '两行\n内容'], ['other', 123], null]));
  const cache = new PromptSuggestionCache(disk, 'local');
  await cache.load(); expect(cache.get(key)).toBe('');
  const request = vi.fn().mockRejectedValue(new Error('unavailable'));
  await cache.request(key, target, request); await cache.request(key, target, request);
  expect(cache.get(key)).toBe(''); expect(request).toHaveBeenCalledOnce();
});
