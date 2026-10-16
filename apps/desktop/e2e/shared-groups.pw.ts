import { expect, test } from "@playwright/test";

for (const width of [900, 1440]) {
  test(`shared groups include official members and survive reload at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem("codex-switch:language", "zh");
      localStorage.setItem("codex-switch:local-proxy-running", "true");
      localStorage.setItem("codex-switch:local-proxy-port", "15721");
      if (localStorage.getItem("codex-switch:provider-groups")) return;
      localStorage.setItem("codex-switch:provider-groups", JSON.stringify(["Work"]));
      localStorage.setItem("codex-switch:local-proxy-concurrent-group", "Work");
      localStorage.setItem("codex-switch:local-proxy-concurrent-routing", "true");
      localStorage.setItem("codex-switch:account-groups", JSON.stringify(["Official"]));
      localStorage.setItem("codex-switch:account-group-assignments", JSON.stringify({ "demo-1": "Work" }));
      localStorage.setItem("codex-switch:providers", JSON.stringify([{
        id: "api", name: "备用 API", group: "Work", baseUrl: "https://example.test/v1", model: "model",
        models: ["model"], active: false, hasApiKey: true,
      }]));
    });
    const openProviders = async () => {
      await page.getByRole("button", { name: "账户管理", exact: true }).click();
      await page.getByRole("tab", { name: "三方模型及中转", exact: true }).click();
    };
    await page.goto("/");
    await openProviders();
    const toolbar = page.locator("#provider-topbar-actions");
    await expect(toolbar.locator(".provider-group-start-button").filter({ hasText: "Work" })).toHaveText(/Work\s*2/);
    await toolbar.getByRole("button", { name: "分组管理", exact: true }).click();
    const manager = page.getByRole("dialog");
    await expect(manager.getByText("Official", { exact: true })).toBeVisible();
    const row = manager.locator(".provider-group-manager-row").filter({ hasText: "Work" });
    await row.getByRole("button", { name: "重命名分组", exact: true }).click();
    await manager.locator(".provider-group-manager-row input").fill("Shared");
    await manager.getByRole("button", { name: "保存分组", exact: true }).click();
    await expect(manager.getByText("Shared", { exact: true })).toBeVisible();
    const renamed = manager.locator(".provider-group-manager-row").filter({ hasText: "Shared" });
    await expect(renamed.getByRole("button", { name: "重命名分组", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem("codex-switch:local-proxy-concurrent-group"))).toBe("Shared");
    await manager.getByRole("button", { name: "Close", exact: true }).click();
    await expect(manager).toBeHidden();
    const start = toolbar.locator(".provider-group-start-button").filter({ hasText: "Shared" });
    await expect(start).toHaveText(/Shared\s*2/);
    await start.click();
    await expect(start).toBeDisabled();
    const assignments = await page.evaluate(() => JSON.parse(
      localStorage.getItem("codex-switch:account-group-assignments")!,
    ));
    expect(assignments["demo-1"]).toBe("Shared");
    await page.reload();
    await openProviders();
    await expect(toolbar.locator(".provider-group-start-button").filter({ hasText: "Shared" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.codex-tmp/shared-groups-${width}.png`, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
