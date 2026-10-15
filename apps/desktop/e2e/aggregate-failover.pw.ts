import { expect, test } from "@playwright/test";

for (const width of [1440, 900]) {
  test(`edits failover without losing input during health refresh at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem("codex-switch:language", "zh");
      localStorage.setItem("codex-switch:local-proxy-running", "true");
      if (localStorage.getItem("codex-switch:aggregate-apis")) return;
      localStorage.setItem("codex-switch:providers", JSON.stringify(["first", "second"].map((id) => ({
        id, name: id, kind: "custom", baseUrl: "https://example.com/v1", model: "shared-model",
        models: ["shared-model"], active: false, hasApiKey: true,
      }))));
      localStorage.setItem("codex-switch:aggregate-apis", JSON.stringify([{
        id: "combined", name: "聚合测试", model: "shared-model", memberProviderIds: ["first", "second"],
        enabled: true, active: false, memberConversationCounts: {}, memberHealth: {
          first: { state: "coolingDown", consecutiveFailures: 2, retryAfterSeconds: 25 },
          second: { state: "healthy", consecutiveFailures: 0, retryAfterSeconds: 0 },
        },
      }]));
    });
    const openManager = async () => {
      await page.getByRole("button", { name: "账户管理", exact: true }).click();
      await page.getByRole("tab", { name: "三方模型及中转", exact: true }).click();
      await page.getByRole("tabpanel", { name: "三方模型及中转", exact: true })
        .getByRole("button", { name: "聚合 API 管理", exact: true }).click();
    };
    await page.goto("/");
    await openManager();
    await expect(page.getByText("first · 已暂停 · 剩余 25 秒", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "编辑聚合 API", exact: true }).click();
    await page.locator("details summary").click();
    await page.locator("#failoverPolicy_maxAttempts").fill("6");
    await page.evaluate(() => {
      const key = "codex-switch:aggregate-apis";
      const aggregates = JSON.parse(localStorage.getItem(key)!);
      aggregates[0].memberHealth.first = { state: "recovering", consecutiveFailures: 2, retryAfterSeconds: 0 };
      localStorage.setItem(key, JSON.stringify(aggregates));
    });
    // The aggregate is inactive: the open manager must still refresh its runtime state.
    await expect(page.getByText("first · 恢复检查中", { exact: true })).toBeAttached();
    await expect(page.locator("#failoverPolicy_maxAttempts")).toHaveValue("6");
    const editor = page.getByRole("dialog", { name: "编辑聚合 API", exact: true });
    await editor.getByRole("button", { name: "保存聚合 API", exact: true }).click();
    await expect(editor).toBeHidden();
    await page.reload();
    await openManager();
    await page.getByRole("button", { name: "编辑聚合 API", exact: true }).click();
    await page.locator("details summary").click();
    await expect(page.locator("#failoverPolicy_maxAttempts")).toHaveValue("6");
    await page.screenshot({ path: `../../.codex-tmp/aggregate-failover-${width}.png`, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
