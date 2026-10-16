// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { activateProviderGroup, deactivateProvider, loadAccounts, loadAppSettings, loadLocalProxyStatus,
  loadProviders, setAccountGroup, updateAccountGroups, updateProviderGroups } from "./backend";

beforeEach(() => localStorage.clear());

it("reads both legacy catalogs and persists changes from either group manager", async () => {
  localStorage.setItem("codex-switch:provider-groups", JSON.stringify(["API"]));
  localStorage.setItem("codex-switch:account-groups", JSON.stringify(["Official"]));
  expect((await loadAppSettings()).providerGroups).toEqual(["API", "Official"]);
  expect((await loadAppSettings()).accountGroups).toEqual(["API", "Official"]);
  await updateProviderGroups(["Shared"]);
  expect((await loadAppSettings()).accountGroups).toEqual(["Shared"]);
  await updateAccountGroups(["Renamed"]);
  expect((await loadAppSettings()).providerGroups).toEqual(["Renamed"]);
});

it("starts mixed and official-only groups, with the same proxy requirement", async () => {
  await setAccountGroup("demo-1", "Shared");
  expect((await loadAccounts())[0].group).toBe("Shared");
  await expect(activateProviderGroup("Shared")).rejects.toThrow("Start the local proxy");
  localStorage.setItem("codex-switch:local-proxy-running", "true");
  localStorage.setItem("codex-switch:local-proxy-port", "15721");
  await activateProviderGroup(" Shared ");
  expect((await loadLocalProxyStatus()).activeProviderGroup).toBe("Shared");
  localStorage.setItem("codex-switch:providers", JSON.stringify([
    { id: "inside", name: "Inside", group: "Shared", baseUrl: "https://example.test", model: "m", models: ["m"] },
    { id: "outside", name: "Outside", group: "Home", baseUrl: "https://example.test", model: "m", models: ["m"] },
  ]));
  await activateProviderGroup("Shared");
  expect((await loadProviders()).filter(provider => provider.active).map(provider => provider.id)).toEqual(["inside"]);
  await deactivateProvider();
  expect((await loadLocalProxyStatus()).activeProviderGroup).toBeNull();
  await expect(activateProviderGroup("Missing")).rejects.toThrow("does not contain");
});
