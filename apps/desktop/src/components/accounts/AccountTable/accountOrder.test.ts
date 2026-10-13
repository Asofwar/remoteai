// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_ORDER_STORAGE_KEY, applyAccountOrder, loadAccountOrder, moveAccount } from "./accountOrder";

afterEach(() => localStorage.clear());

describe("account display order", () => {
  it("retains manual order across refreshed data, drops deleted IDs and appends new accounts", () => {
    const accounts = [{ id: "new" }, { id: "a", active: true }, { id: "b", disabled: true }];
    expect(applyAccountOrder(accounts, ["deleted", "b", "b", "a"])).toEqual([
      accounts[2], accounts[1], accounts[0],
    ]);
    expect(applyAccountOrder(accounts, [])).toEqual(accounts);
  });

  it("moves an account in either direction without losing other accounts", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveAccount(order, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveAccount(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveAccount(order, "missing", "c")).toEqual(order);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it.each(["not json", "null", "{}", "42"])("ignores invalid stored order %s", (value) => {
    localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, value);
    expect(loadAccountOrder()).toEqual([]);
  });

  it("validates persisted IDs and removes duplicates", () => {
    localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(["b", null, 5, {}, "", "a", "b"]));
    expect(loadAccountOrder()).toEqual(["b", "a"]);
  });
});
