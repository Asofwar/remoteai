import { test, expect } from "@playwright/test";
import { modelSettingsBackend } from "./model-settings-backend";

for (const width of [1280, 390]) {
  test(`refreshes from the model picker without duplicate requests at ${width}px`, async ({ page }) => {
    const backend = modelSettingsBackend();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      const picker = page.getByRole("button", { name: /^模型与推理强度/ });
      await expect(picker).toContainText("模型一");
      await picker.click();
      await page.getByRole("button", { name: "选择模型", exact: true }).click();
      const refresh = page.getByRole("button", { name: "刷新", exact: true });
      expect(backend.discoveryRequests()).toBe(0);
      backend.pauseModels();
      backend.addModel("新模型");
      await refresh.dblclick();
      await expect(refresh).toBeDisabled();
      await expect(refresh).toHaveAttribute("aria-busy", "true");
      await expect.poll(backend.discoveryRequests).toBe(1);
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      await page.getByRole("menuitemradio", { name: "模型一", exact: true }).press("Escape");
      await expect(picker).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("textbox", { name: "聊天消息" }).fill("刷新期间仍可输入");
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      await picker.click();
      await page.getByRole("button", { name: "选择模型", exact: true }).click();
      await expect(refresh).toBeDisabled();
      backend.releaseModels();
      await expect(refresh).toBeEnabled();
      await expect(page.getByRole("menuitemradio", { name: "新模型", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitemradio", { name: "模型一", exact: true })).toHaveAttribute("aria-checked", "true");
      expect(backend.discoveryRequests()).toBe(1);
      backend.emptyModels(true);
      await refresh.click();
      await expect(page.getByRole("alert")).toContainText("模型列表暂时无法更新");
      await expect(refresh).toBeEnabled();
      await expect(page.getByRole("menuitemradio", { name: "模型一", exact: true })).toBeVisible();
      backend.emptyModels(false);
      await refresh.click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(refresh).toBeEnabled();
      expect(backend.discoveryRequests()).toBe(3);
      await page.locator(".ant-popover-inner").screenshot({ path: `../../.codex-tmp/model-picker-refresh-${width}.png` });
    } finally { backend.releaseModels(); backend.releaseUsage(); }
  });
}
