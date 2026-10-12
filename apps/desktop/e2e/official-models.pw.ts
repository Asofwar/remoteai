import { expect, test } from "@playwright/test";
import { officialModelsBackend } from "./official-models-backend";

const harness = "/e2e/official-models-harness.html";

for (const width of [1280, 390]) {
  test(`model refresh interval and disabled state persist at ${width}px`, async ({ page }) => {
    const backend = await officialModelsBackend(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(harness);
    await expect(page.getByText("对外代理和 Codex GUI 优先从官方获取模型，获取失败时使用此列表。")).toBeVisible();
    const interval = page.getByRole("spinbutton", { name: "更新间隔（分钟）" });
    await expect(interval).toHaveValue("30");
    await interval.fill("90");
    await page.getByRole("button", { name: "保存更新设置" }).click();
    await expect(page.getByText("每 90 分钟更新", { exact: true })).toBeVisible();
    expect(backend.saves[0]).toEqual({ enabled: true, intervalMinutes: 90, revision: "settings-1" });
    await page.reload();
    await expect(interval).toHaveValue("90");
    await page.getByRole("switch", { name: "自动从官方更新" }).click();
    await page.getByRole("button", { name: "保存更新设置" }).click();
    await expect(page.getByText("已关闭", { exact: true })).toBeVisible();
    await expect(interval).toBeDisabled();
    await page.getByRole("button", { name: "从官方刷新", exact: true }).click();
    await expect.poll(backend.refreshes).toBe(1);
    await page.reload();
    await expect(page.getByRole("switch", { name: "自动从官方更新" })).not.toBeChecked();
    await expect(interval).toHaveValue("90");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.codex-tmp/official-models-${width}.png`, fullPage: true });
  });
}

test("failed settings saves preserve both the schedule draft and unsaved model JSON", async ({ page }) => {
  const backend = await officialModelsBackend(page);
  backend.failSave();
  await page.goto(harness);
  const interval = page.getByRole("spinbutton", { name: "更新间隔（分钟）" });
  await expect(interval).toHaveValue("30");
  const save = page.getByRole("button", { name: "保存更新设置" });
  await interval.fill("");
  await expect(save).toBeDisabled();
  await interval.fill("1.5");
  await expect(save).toBeDisabled();
  await interval.fill("45");
  const models = page.getByRole("textbox", { name: "模型列表内容" });
  await models.fill('{"models":[{"slug":"unsaved"}]}');
  await save.click();
  await expect(page.getByText("自动更新设置已更改，请重新加载后再保存。", { exact: true })).toBeVisible();
  await expect(interval).toHaveValue("45");
  await expect(models).toHaveValue('{"models":[{"slug":"unsaved"}]}');
  await expect(page.getByText("每 30 分钟更新", { exact: true })).toBeVisible();
  expect(backend.saves).toHaveLength(1);
  const notice = page.locator(".ant-message-notice").last();
  expect((await notice.boundingBox())!.width).toBeLessThanOrEqual(400);
});

test("read-only users can see refresh settings without management controls", async ({ page }) => {
  await officialModelsBackend(page);
  await page.goto(`${harness}?readonly`);
  await expect(page.getByRole("spinbutton", { name: "更新间隔（分钟）" })).toHaveValue("30");
  await expect(page.getByRole("switch", { name: "自动从官方更新" })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "更新间隔（分钟）" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存更新设置" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "从官方刷新", exact: true })).toHaveCount(0);
});

test("English settings expose the same interval and enable control", async ({ page }) => {
  await officialModelsBackend(page);
  await page.goto(`${harness}?en`);
  await expect(page.getByRole("spinbutton", { name: "Update interval (minutes)" })).toHaveValue("30");
  await page.getByRole("switch", { name: "Update automatically" }).click();
  await page.getByRole("button", { name: "Save update settings" }).click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
});
