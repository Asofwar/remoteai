import { expect, test } from "@playwright/test";
import { officialModelsBackend } from "./official-models-backend";

const harness = "/e2e/official-models-harness.html";

for (const width of [1280, 390]) {
  test(`help reasoning defaults and saved settings persist at ${width}px`, async ({ page }) => {
    const backend = await officialModelsBackend(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(harness);
    const effort = page.getByRole("combobox", { name: "推理强度", exact: true });
    const selection = page.locator(".ant-select").filter({ has: effort });
    await expect(selection).toContainText("低（low）");
    await selection.click();
    await page.getByText("极高（xhigh）", { exact: true }).click();
    await page.getByRole("button", { name: "保存助手设置", exact: true }).click();
    await expect(page.getByText("助手设置已保存，下次提问时生效。", { exact: true })).toBeVisible();
    expect(backend.helpSaves[0]).toEqual({
      model: "gpt-test", effort: "xhigh", systemPrompt: "Be concise.", revision: "help-1",
    });
    await page.reload();
    await expect(selection).toContainText("极高（xhigh）");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.codex-tmp/help-settings-${width}.png`, fullPage: true });
  });
}

test("read-only users cannot change help reasoning", async ({ page }) => {
  await officialModelsBackend(page);
  await page.goto(`${harness}?readonly`);
  await expect(page.getByRole("combobox", { name: "推理强度", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存助手设置", exact: true })).toHaveCount(0);
});

test("failed saves retain the reasoning draft", async ({ page }) => {
  const backend = await officialModelsBackend(page);
  backend.failSave();
  await page.goto(harness);
  const effort = page.getByRole("combobox", { name: "推理强度", exact: true });
  await page.locator(".ant-select").filter({ has: effort }).click();
  await page.getByText("高（high）", { exact: true }).click();
  await page.getByRole("button", { name: "保存助手设置", exact: true }).click();
  await expect(page.getByText("助手设置已更新，请重新加载后再保存。", { exact: true })).toBeVisible();
  await expect(page.locator(".ant-select").filter({ has: effort })).toContainText("高（high）");
});

test("English help reasoning exposes all supported levels", async ({ page }) => {
  const backend = await officialModelsBackend(page);
  await page.goto(`${harness}?en`);
  await page.getByRole("combobox", { name: "Reasoning effort", exact: true }).press("ArrowDown");
  await expect(page.locator(".ant-select-dropdown .ant-select-item-option")).toHaveCount(8);
  await page.getByText("ultra", { exact: true }).click();
  await page.getByRole("button", { name: "Save assistant settings", exact: true }).click();
  await expect.poll(() => backend.helpSaves[0]?.effort).toBe("ultra");
});
