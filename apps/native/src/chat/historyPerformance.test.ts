import { expect, it } from 'vitest';
import { HistoryCache } from '../../../../shared/remote-chat/client/historyCache';
import { HistoryVersionCache, historyVersion } from '../../../../shared/remote-chat/historySync';
import { getChatPolicy } from '../../../../shared/remote-chat/policy';
import type { Thread } from './types';

function thread(id: string, count = 1, text = 'message'): Thread {
  return { id, preview: '', cwd: '', updatedAt: 1, turns: [{ id: 'turn', status: 'completed',
    items: Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, type: 'agentMessage', text })) }] };
}

it('retains only the latest page when leaving an expanded conversation', () => {
  const cache = new HistoryCache();
  const original = thread('long', 100);
  cache.remember(original, { hasMore: false });
  const cached = cache.get('long');
  expect(cached?.thread.turns?.[0].items).toHaveLength(getChatPolicy().historyPageSize);
  expect(cached?.page).toEqual({ hasMore: true, start: { turnId: 'turn', itemId: 'item-90' } });
  expect(original.turns?.[0].items).toHaveLength(100);
  expect(cached?.thread.turns?.[0].items.at(-1)).toBe(original.turns?.[0].items.at(-1));
});

it('keeps the PC paging boundary when the retained page is already short', () => {
  const cache = new HistoryCache();
  cache.remember(thread('short'), { hasMore: true, start: { turnId: 'turn', itemId: 'item-0' } });
  expect(cache.get('short')?.page.hasMore).toBe(true);
});

it('evicts the least recently visited chat by content budget as well as chat count', () => {
  const cache = new HistoryCache({ entries: 3, chars: 1000 });
  for (const id of ['a', 'b', 'c']) cache.remember(thread(id, 1, 'x'.repeat(300)));
  expect(cache.has('a')).toBe(false);
  expect(cache.has('b')).toBe(true);
  cache.get('b');
  cache.remember(thread('d', 1, 'x'.repeat(300)));
  expect(cache.has('c')).toBe(false);
  expect(cache.has('b')).toBe(true);
});

it('does not retain an oversized output and accounts correctly for replacements', () => {
  const cache = new HistoryCache({ entries: 2, chars: 1000 });
  cache.remember(thread('a', 1, 'x'.repeat(2000)));
  expect(cache.get('a')).toBeUndefined();
  for (let visit = 0; visit < 100; visit++) cache.remember(thread('a'));
  cache.remember(thread('b'));
  expect(cache.has('a')).toBe(true);
  cache.remember(thread('c'));
  expect(cache.has('a')).toBe(false);
  expect(cache.has('b')).toBe(true);
});

it('reuses fingerprints of immutable history and only recalculates changed items', () => {
  const versions = new HistoryVersionCache();
  const original = thread('chat', 2, 'x'.repeat(100_000));
  const before = versions.read(original);
  expect(before).toEqual(historyVersion(original));
  expect(versions.read({ ...original }).turns[0]).toBe(before.turns[0]);
  const turn = original.turns![0];
  const updated = { ...original, turns: [{ ...turn, items: [turn.items[0], { ...turn.items[1], text: 'changed' }] }] };
  const after = versions.read(updated);
  expect(after).toEqual(historyVersion(updated));
  expect(after.turns[0].items[0]).toBe(before.turns[0].items[0]);
  expect(after.turns[0].items[1]).not.toBe(before.turns[0].items[1]);
  expect(versions.read(original)).toEqual(before);
});
