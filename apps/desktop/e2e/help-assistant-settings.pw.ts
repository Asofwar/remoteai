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
    expect(backend.helpSaves[0]).toMatchObject({
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

test('suggested questions can be edited, added and removed, including an empty list', async ({ page }) => {
  const backend = await officialModelsBackend(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(harness);
  await page.getByRole('textbox', { name: '中文问题 1', exact: true }).fill('帮我检查当前设置');
  await page.getByRole('button', { name: '新增问题', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存助手设置', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '中文问题 4', exact: true }).fill('如何启用电脑助手？');
  await page.getByRole('button', { name: '保存助手设置', exact: true }).click();
  await expect.poll(() => backend.helpSaves.length).toBe(1);
  expect(backend.helpSaves[0].questions).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '中文问题 1', exact: true })).toHaveValue('帮我检查当前设置');
  await expect(page.getByRole('textbox', { name: '中文问题 4', exact: true })).toHaveValue('如何启用电脑助手？');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.codex-tmp/help-questions-admin.png', fullPage: true });
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: '删除问题 1', exact: true }).click();
  await page.getByRole('button', { name: '保存助手设置', exact: true }).click();
  await expect.poll(() => backend.helpSaves.length).toBe(2);
  expect(backend.helpSaves[1].questions).toEqual([]);
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
