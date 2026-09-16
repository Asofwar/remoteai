import type { TotpEntry } from './types';

export type TotpSortOrder = 'default' | 'name' | 'newest';

export function selectTotpEntries(entries: TotpEntry[], query: string, sort: TotpSortOrder): TotpEntry[] {
  const search = query.trim().toLocaleLowerCase();
  const matching = entries.filter((entry) => (
    `${entry.issuer} ${entry.accountName}`.toLocaleLowerCase().includes(search)
  ));
  if (sort === 'name') return matching.sort((a, b) => a.issuer.localeCompare(b.issuer, 'zh-CN'));
  if (sort === 'newest') return matching.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return matching;
}
