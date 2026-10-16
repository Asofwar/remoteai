// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { loadAggregateApis, saveAggregateApiProfile } from "../../../api/backend";
import type { AggregateApiInput } from "../../../types";
import { defaultFailoverPolicy } from "./failoverPolicy";

const input: AggregateApiInput = {
  name: "Combined", model: "model", memberProviderIds: ["first", "second"], enabled: true,
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("codex-switch:providers", JSON.stringify(input.memberProviderIds.map((id) => ({
    id, name: id, baseUrl: "https://example.com", model: "model", models: ["model"],
  }))));
});

it("loads defaults for older aggregates and persists custom settings across reloads", async () => {
  localStorage.setItem("codex-switch:aggregate-apis", JSON.stringify([{ ...input, id: "legacy" }]));
  expect((await loadAggregateApis())[0].failoverPolicy).toEqual(defaultFailoverPolicy());
  const custom = { ...defaultFailoverPolicy(), enabled: false, maxAttempts: 6, retryStatusCodes: [429] };
  const saved = await saveAggregateApiProfile({ ...input, id: "legacy", failoverPolicy: custom });
  expect(saved.failoverPolicy).toEqual(custom);
  expect((await loadAggregateApis())[0].failoverPolicy).toEqual(custom);
  await saveAggregateApiProfile({ ...input, id: "legacy", name: "Renamed" });
  expect((await loadAggregateApis())[0].failoverPolicy).toEqual(custom);
  await saveAggregateApiProfile({ ...input, id: "legacy", failoverPolicy: defaultFailoverPolicy() });
  expect((await loadAggregateApis())[0].failoverPolicy).toEqual(defaultFailoverPolicy());
});

it("rejects invalid settings without overwriting the last saved aggregate", async () => {
  const saved = await saveAggregateApiProfile(input);
  await expect(saveAggregateApiProfile({ ...input, id: saved.id, failoverPolicy: {
    ...defaultFailoverPolicy(), maxAttempts: 0,
  } })).rejects.toThrow("Check the failover settings");
  expect((await loadAggregateApis())[0].failoverPolicy).toEqual(defaultFailoverPolicy());
});

it("saves mixed and official-only members with explicit models and priority order", async () => {
  for (const memberProviderIds of [["first", "account:demo-1"], ["account:demo-2", "account:demo-1"]]) {
    const memberModels = { first: "model", "account:demo-1": "official-model", "account:demo-2": "another-model" };
    const saved = await saveAggregateApiProfile({ ...input, memberProviderIds, memberModels });
    const reloaded = (await loadAggregateApis()).find(aggregate => aggregate.id === saved.id)!;
    expect(reloaded.memberProviderIds).toEqual(memberProviderIds);
    expect(reloaded.memberModels?.["account:demo-1"]).toBe("official-model");
  }
  await expect(saveAggregateApiProfile({ ...input, memberProviderIds: ["first", "account:missing"] }))
    .rejects.toThrow("Provider does not exist");
  await expect(saveAggregateApiProfile({ ...input, memberProviderIds: ["first", "account:demo-1"],
    memberModels: { "account:demo-1": " " } })).rejects.toThrow("must support the selected model");
});

it("persists member aliases and priority order across legacy updates", async () => {
  localStorage.setItem("codex-switch:providers", JSON.stringify([
    { id: "first", name: "First", baseUrl: "https://example.com", model: "deployment-one", models: ["deployment-one"] },
    { id: "second", name: "Second", baseUrl: "https://example.com", model: "vendor/model", models: ["vendor/model"] },
  ]));
  const memberModels = { first: "deployment-one", second: "vendor/model" };
  const saved = await saveAggregateApiProfile({ ...input, model: "shared", memberModels,
    memberProviderIds: ["second", "first"], failoverPolicy: { ...defaultFailoverPolicy(),
      routingStrategy: "priority", recoverySuccessThreshold: 3, errorRateThresholdPercent: 50 } });
  await saveAggregateApiProfile({ ...input, id: saved.id, model: "shared", memberProviderIds: ["second", "first"] });
  const [reloaded] = await loadAggregateApis();
  expect(reloaded.memberModels).toEqual(memberModels);
  expect(reloaded.memberProviderIds).toEqual(["second", "first"]);
  expect(reloaded.failoverPolicy?.routingStrategy).toBe("priority");
  await expect(saveAggregateApiProfile({ ...input, model: "shared", memberModels: {
    first: "unsupported", second: "vendor/model",
  } })).rejects.toThrow("must support the selected model");
});
