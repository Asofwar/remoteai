import { describe, expect, it } from 'vitest';
import { selectTotpEntries } from './entryList';
import type { TotpEntry } from './types';

const entries: TotpEntry[] = [
  { id: 'github', issuer: 'GitHub', accountName: 'octocat@example.test', createdAt: '2026-09-01T00:00:00Z' },
  { id: 'aws', issuer: 'Amazon Web Services', accountName: 'admin@example.test', createdAt: '2026-09-02T00:00:00Z' },
].map((entry) => ({
  ...entry, secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30, updatedAt: entry.createdAt,
}));

describe('2FA list search and sorting', () => {
  it('finds services and accounts without case or surrounding whitespace sensitivity', () => {
    expect(selectTotpEntries(entries, ' GITHUB ', 'default').map((entry) => entry.id)).toEqual(['github']);
    expect(selectTotpEntries(entries, 'ADMIN@', 'default').map((entry) => entry.id)).toEqual(['aws']);
    expect(selectTotpEntries(entries, 'missing', 'default')).toEqual([]);
  });

  it('never searches secrets', () => {
    expect(selectTotpEntries(entries, entries[0].secret, 'default')).toEqual([]);
  });

  it('sorts a copy and preserves the original order when search is cleared', () => {
    expect(selectTotpEntries(entries, '', 'name').map((entry) => entry.id)).toEqual(['aws', 'github']);
    expect(selectTotpEntries(entries, '', 'newest').map((entry) => entry.id)).toEqual(['aws', 'github']);
    expect(selectTotpEntries(entries, '  ', 'default').map((entry) => entry.id)).toEqual(['github', 'aws']);
    expect(entries.map((entry) => entry.id)).toEqual(['github', 'aws']);
  });
});
