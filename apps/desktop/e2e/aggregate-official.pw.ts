import { expect, test } from "@playwright/test";

for (const width of [1440, 900]) {
  test(`selects and persists official aggregate members during polling at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem("codex-switch:language", "zh");
      localStorage.setItem("codex-switch:local-proxy-running", "true");
      if (localStorage.getItem("codex-switch:aggregate-apis")) return;
      localStorage.setItem("codex-switch:providers", JSON.stringify([{
        id: "api", name: "备用 API", baseUrl: "https://example.com/v1", model: "api-model",
        models: ["api-model"], active: false, hasApiKey: true,
      }]));
      localStorage.setItem("codex-switch:aggregate-apis", JSON.stringify([{
        id: "mixed", name: "官方与 API", model: "shared-model", memberProviderIds: ["api", "account:demo-2"],
        memberModels: { api: "api-model", "account:demo-2": "official-model" },
        enabled: true, active: true, memberConversationCounts: {},
      }]));
    });
    const openManager = async () => {
      await page.getByRole("button", { name: "账户管理", exact: true }).click();
      await page.getByRole("tab", { name: "三方模型及中转", exact: true }).click();
      await page.getByRole("tabpanel", { name: "三方模型及中转", exact: true })
        .getByRole("button", { name: "聚合 API 管理", exact: true }).click();
      await page.getByRole("button", { name: "编辑聚合 API", exact: true }).click();
    };
    await page.goto("/");
    await openManager();
    await page.locator("#memberProviderIds").click();
    await page.locator("#memberProviderIds").fill("alex");
    await page.locator(".ant-select-item-option-content").filter({ hasText: "alex" }).click();
    await page.locator("#memberProviderIds").press("Escape");
    const officialModel = page.locator('[id="memberModels_account:demo-1"]');
    await officialModel.fill("gpt-official");
    await officialModel.press("Tab");
    await page.evaluate(() => {
      const key = "codex-switch:aggregate-apis";
      const aggregates = JSON.parse(localStorage.getItem(key)!);
      aggregates[0].memberHealth = {
        "account:demo-2": { state: "coolingDown", consecutiveFailures: 2, retryAfterSeconds: 25 },
      };
      localStorage.setItem(key, JSON.stringify(aggregates));
    });
    await expect(page.getByText(/官方账户.*已暂停.*25/)).toBeAttached();
    await expect(officialModel).toHaveValue("gpt-official");
    const editor = page.getByRole("dialog", { name: "编辑聚合 API", exact: true });
    await editor.getByRole("button", { name: "保存聚合 API", exact: true }).click();
    await expect(editor).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("codex-switch:aggregate-apis")!)[0]);
    expect(saved.memberProviderIds).toEqual(["api", "account:demo-2", "account:demo-1"]);
    expect(saved.memberModels["account:demo-1"]).toBe("gpt-official");
    await page.reload();
    await openManager();
    await expect(officialModel).toHaveValue("gpt-official");
    await expect(page.locator('[id="memberModels_account:demo-2"]')).toHaveValue("official-model");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.codex-tmp/aggregate-official-${width}.png`, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
