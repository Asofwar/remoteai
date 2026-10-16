import { expect, it, vi } from "vitest";
import { DEMO_ACCOUNTS } from "../demo";
import type { Provider } from "../types";
import { changeSharedGroupMembers, sharedGroupNames } from "./sharedGroups";

it("merges legacy catalogs and member groups without duplicate or blank names", () => {
  expect(sharedGroupNames([" Work ", "API"], ["Work", "Official", ""])).toEqual(["Work", "API", "Official"]);
});

const providers = [
  { id: "api", kind: "custom", group: "Work" },
  { id: "outside", kind: "custom", group: "Home" },
] as Provider[];
const accounts = DEMO_ACCOUNTS.map(account => ({ ...account, group: account.id === "demo-1" ? "Work" : "Home" }));

it.each(["Renamed", ""])("updates both kinds of members when moving a group to '%s'", async nextGroup => {
  const changeProviders = vi.fn(async (ids: string[]) => ids);
  const changeAccounts = vi.fn(async (ids: string[]) => ids);
  expect(await changeSharedGroupMembers({ accounts, providers, group: "Work", nextGroup,
    changeProviders, changeAccounts })).toBe(true);
  expect(changeProviders).toHaveBeenCalledWith(["api"], nextGroup);
  expect(changeAccounts).toHaveBeenCalledWith(["demo-1"], nextGroup);
});

it("keeps account membership intact when a running API group rejects the change", async () => {
  const changeProviders = vi.fn(async () => []);
  const changeAccounts = vi.fn(async (ids: string[]) => ids);
  expect(await changeSharedGroupMembers({ accounts, providers, group: "Work", nextGroup: "Renamed",
    changeProviders, changeAccounts })).toBe(false);
  expect(changeAccounts).not.toHaveBeenCalled();
});
