import type { Account, Provider } from "../types";

export function sharedGroupNames(...sources: string[][]): string[] {
  return [...new Set(sources.flat().map(group => group.trim()).filter(Boolean))];
}

interface SharedGroupChange {
  accounts: Account[];
  providers: Provider[];
  group: string;
  nextGroup: string;
  changeAccounts: (ids: string[], group: string) => Promise<string[]>;
  changeProviders: (ids: string[], group: string) => Promise<string[]>;
}

export async function changeSharedGroupMembers(options: SharedGroupChange): Promise<boolean> {
  const providerIds = options.providers
    .filter(provider => provider.kind === "custom" && provider.group === options.group).map(({ id }) => id);
  const accountIds = options.accounts.filter(account => account.group === options.group).map(({ id }) => id);
  // Provider changes validate active groups first, before any account membership is changed.
  const changedProviders = await options.changeProviders(providerIds, options.nextGroup);
  if (changedProviders.length !== providerIds.length) return false;
  const changedAccounts = await options.changeAccounts(accountIds, options.nextGroup);
  return changedAccounts.length === accountIds.length;
}
