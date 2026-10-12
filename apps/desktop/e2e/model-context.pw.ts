import { expect, test } from "@playwright/test";
import { modelSettingsBackend } from "./model-settings-backend";

for (const width of [1280, 390]) {
  test(`edits model context during a task and pending usage refresh at ${width}px`, async ({ page }, info) => {
    const backend = modelSettingsBackend();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/e2e/model-settings-harness.html", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "对话 a", exact: true }).click();
      backend.startTurn("a");
      await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "GUI 设置", exact: true }).click();
      await page.getByRole("tab", { name: "上下文", exact: true }).click();
      const field = page.getByRole("combobox", { name: "first 上下文容量", exact: true });
      await expect(field).toHaveAttribute("placeholder", "128");
      const beats = Number(await page.getByLabel("刷新次数").textContent());
      await field.fill("1000");
      await page.getByRole("heading", { name: "模型默认上下文" }).click();
      await expect.poll(() => backend.contextOverrides.first).toBe(1_000_000);
      backend.contextDefaults.first = 256_000;
      await page.getByRole("button", { name: "刷新默认值" }).click();
      await expect(field).toHaveValue("1000");
      await expect(field).toHaveAttribute("placeholder", "256");
      await expect.poll(async () => Number(await page.getByLabel("刷新次数").textContent())).toBeGreaterThan(beats);
      expect(backend.sends).toHaveLength(0);
      const section = page.getByRole("region", { name: "模型默认上下文" });
      const box = await section.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`model-context-${width}.png`), animations: "disabled" });
      await page.getByRole("button", { name: "恢复默认", exact: true }).filter({ visible: true }).first().click();
      await expect.poll(() => backend.contextOverrides.first ?? null).toBeNull();
      await expect(field).toHaveValue("");
      await page.getByRole("button", { name: /^完\s*成$/ }).click();
      await expect(page.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
    } finally { backend.releaseUsage(); }
  });
}
