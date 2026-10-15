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
        models: ["shared-model", `${id}-deployment`], active: false, hasApiKey: true,
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
    await page.locator("#failoverPolicy_routingStrategy").focus();
    await page.locator("#failoverPolicy_routingStrategy").press("ArrowDown");
    await page.getByText("按优先顺序备援", { exact: true }).last().click();
    await page.getByRole("combobox", { name: "first 上游模型", exact: true }).focus();
    await page.getByRole("combobox", { name: "first 上游模型", exact: true }).press("ArrowDown");
    await page.getByText("first-deployment", { exact: true }).last().click();
    await page.getByRole("combobox", { name: "second 上游模型", exact: true }).focus();
    await page.getByRole("combobox", { name: "second 上游模型", exact: true }).press("ArrowDown");
    await page.getByText("second-deployment", { exact: true }).last().click();
    await page.getByRole("button", { name: "提高服务优先级", exact: true }).nth(1).click();
    await page.locator("#failoverPolicy_recoverySuccessThreshold").fill("3");
    await page.locator("#failoverPolicy_errorRateThresholdPercent").fill("50");
    await page.locator("#failoverPolicy_errorRateMinRequests").fill("12");
    await page.evaluate(() => {
      const key = "codex-switch:aggregate-apis";
      const aggregates = JSON.parse(localStorage.getItem(key)!);
      aggregates[0].memberHealth.first = { state: "recovering", consecutiveFailures: 2, retryAfterSeconds: 0 };
      localStorage.setItem(key, JSON.stringify(aggregates));
    });
    // The aggregate is inactive: the open manager must still refresh its runtime state.
    await expect(page.getByText("first · 恢复检查中", { exact: true })).toBeAttached();
    await expect(page.locator("#failoverPolicy_maxAttempts")).toHaveValue("6");
    await expect(page.getByRole("combobox", { name: "first 上游模型", exact: true }))
      .toHaveAttribute("id", "memberModels_first");
    await expect(page.locator("#failoverPolicy_recoverySuccessThreshold")).toHaveValue("3");
    const editor = page.getByRole("dialog", { name: "编辑聚合 API", exact: true });
    await editor.getByRole("button", { name: "保存聚合 API", exact: true }).click();
    await expect(editor).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("codex-switch:aggregate-apis")!)[0]);
    expect(saved.memberProviderIds).toEqual(["second", "first"]);
    expect(saved.memberModels).toEqual({ first: "first-deployment", second: "second-deployment" });
    expect(saved.failoverPolicy).toMatchObject({ routingStrategy: "priority", recoverySuccessThreshold: 3,
      errorRateThresholdPercent: 50, errorRateMinRequests: 12 });
    await page.reload();
    await openManager();
    await page.getByRole("button", { name: "编辑聚合 API", exact: true }).click();
    await page.locator("details summary").click();
    await expect(page.locator("#failoverPolicy_maxAttempts")).toHaveValue("6");
    await expect(page.locator("#failoverPolicy_recoverySuccessThreshold")).toHaveValue("3");
    await expect(page.getByText("1. second", { exact: true })).toBeVisible();
    await expect(page.getByText("first-deployment", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.codex-tmp/aggregate-failover-${width}.png`, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
