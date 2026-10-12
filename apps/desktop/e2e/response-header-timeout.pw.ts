import { expect, test } from "@playwright/test";

// The desktop settings shell has an 810px minimum width.
for (const width of [1280, 810]) {
  test(`initial response wait saves and reloads with session polling open at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/e2e/response-header-timeout-harness.html");
    const duration = page.getByLabel("最长首次等待时间");
    await expect(duration).toBeEnabled();
    await expect(duration).toHaveValue("00:10:00");
    await duration.fill("00:15:00");
    await duration.press("Enter");
    await page.getByRole("button", { name: "Click 0", exact: true }).click();
    await expect(duration).toHaveValue("00:15:00");
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("codex-switch.response-header-timeout") ?? "{}").timeoutSeconds,
    )).toBe(900);
    await page.reload();
    await expect(duration).toBeEnabled();
    await expect(duration).toHaveValue("00:15:00");
    await page.getByRole("button", { name: "Click 0", exact: true }).click();
    await expect(page.getByRole("button", { name: "Click 1", exact: true })).toBeVisible();
    const card = page.locator(".settings-card");
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`response-header-timeout-${width}.png`), fullPage: true });
  });
}
