import { useMemo, useState } from "react";
import type { TableProps } from "antd";
import type { Account } from "../../../types";
import { ACCOUNT_ORDER_STORAGE_KEY, applyAccountOrder, loadAccountOrder } from "./accountOrder";

const COLUMN_SORT_STORAGE_KEY = "codex-switch:account-table-usage-sort";
type SortColumn = "account" | "group" | "fiveHours" | "oneWeek";
export type AccountSortOrder = "ascend" | "descend";
interface ColumnSort { column: SortColumn; order: AccountSortOrder }

function isSortColumn(value: unknown): value is SortColumn {
  return value === "account" || value === "group" || value === "fiveHours" || value === "oneWeek";
}

function loadColumnSort(): ColumnSort | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLUMN_SORT_STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const preference = value as Partial<ColumnSort>;
    if (!isSortColumn(preference.column)) return null;
    if (preference.order !== "ascend" && preference.order !== "descend") return null;
    return { column: preference.column, order: preference.order };
  } catch {
    return null;
  }
}

export function useAccountOrder(accounts: Account[]) {
  const [order, setOrder] = useState(loadAccountOrder);
  const [columnSort, setColumnSort] = useState(loadColumnSort);
  const orderedAccounts = useMemo(() => applyAccountOrder(accounts, order), [accounts, order]);
  const handleTableChange: NonNullable<TableProps<Account>["onChange"]> = (_, __, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    const next = isSortColumn(active.columnKey) && active.order
      ? { column: active.columnKey, order: active.order } : null;
    setColumnSort(next);
    try {
      if (next) localStorage.setItem(COLUMN_SORT_STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(COLUMN_SORT_STORAGE_KEY);
    } catch {
      // Column sorting remains usable when preferences cannot be saved.
    }
  };
  const saveOrder = (ids: string[]) => {
    const next = applyAccountOrder(accounts, ids).map((account) => account.id);
    // Save before applying so the dialog can report a failure without losing its draft.
    localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(next));
    localStorage.removeItem(COLUMN_SORT_STORAGE_KEY);
    setOrder(next);
    setColumnSort(null);
  };
  return { orderedAccounts, columnSort, handleTableChange, saveOrder };
}
