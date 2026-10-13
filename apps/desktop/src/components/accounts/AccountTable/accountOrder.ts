export const ACCOUNT_ORDER_STORAGE_KEY = "codex-switch:account-table-order";

export function loadAccountOrder(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];
  } catch {
    return [];
  }
}

/** Ignore removed accounts and append new accounts without disturbing the saved order. */
export function applyAccountOrder<T extends { id: string }>(accounts: readonly T[], order: readonly string[]): T[] {
  const remaining = new Map(accounts.map((account) => [account.id, account]));
  const ordered: T[] = [];
  for (const id of order) {
    const account = remaining.get(id);
    if (!account) continue;
    ordered.push(account);
    remaining.delete(id);
  }
  return [...ordered, ...remaining.values()];
}

export function moveAccount(order: readonly string[], source: string, target: string): string[] {
  const from = order.indexOf(source);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}
