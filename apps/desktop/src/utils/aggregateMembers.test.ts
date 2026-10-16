import { expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "../demo";
import { aggregateMemberAccountId, buildAggregateMembers } from "./aggregateMembers";

it("offers compatible official accounts even when automatic switching is disabled and masks private emails", () => {
  const accounts = [...DEMO_ACCOUNTS, { ...DEMO_ACCOUNTS[0], id: "incompatible", localProxyCompatible: false }];
  const members = buildAggregateMembers({ providers: [], accounts, officialModels: ["official-model"],
    officialLabel: "官方账户", privacyMode: true });
  expect(members.some(member => member.id === "account:demo-2")).toBe(true);
  expect(members.some(member => member.id === "account:incompatible")).toBe(false);
  expect(members[0].name).not.toContain(DEMO_ACCOUNTS[0].email);
  expect(members[0].models).toEqual(["official-model"]);
  expect(aggregateMemberAccountId(members[0].id)).toBe(DEMO_ACCOUNTS[0].id);
  expect(aggregateMemberAccountId("ordinary-provider")).toBeNull();
});
