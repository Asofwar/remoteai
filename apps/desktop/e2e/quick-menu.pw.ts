import { test, expect } from "@playwright/test";

test("a hidden WebView can present the menu without animation frames", async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("/e2e/quick-menu-harness.html");
  await expect(page.locator("body")).toHaveAttribute("data-present", /"revision":1/);
});

test("glass menu preserves selection, quotas, model navigation and Escape dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/e2e/quick-menu-harness.html");
  await expect(page.getByRole("menuitemradio", { name: /cuddle2piper/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".quick-menu-quota.danger")).toHaveCount(2);
  await expect(page.getByRole("menuitemradio", { name: "暂不可切换" })).toBeDisabled();
  await page.screenshot({ path: "../../.codex-tmp/quick-menu-light.png" });
  const provider = page.getByRole("menuitem", { name: "模型服务" });
  await provider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitemradio", { name: "model-one" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(provider).toBeFocused();
  await provider.click();
  await page.evaluate(() => window.dispatchEvent(new Event("test-refresh")));
  await expect(provider).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-present", /"revision":2/);
  await provider.click();
  await page.getByRole("menuitemradio", { name: "model-two" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-action", /tray:provider-model:two/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).toHaveAttribute("data-dismissed", "true");
});

test("dark menu scrolls on small screens and keyboard reaches the final action", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/e2e/quick-menu-harness.html?dark=1");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitemradio", { name: /cuddle2piper/ }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "退出程序" })).toBeFocused();
  const menu = await page.locator(".quick-menu-panel").boundingBox();
  expect(menu!.width).toBeLessThanOrEqual(320);
  expect(menu!.height).toBeLessThanOrEqual(480);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "../../.codex-tmp/quick-menu-dark-small.png" });
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitemradio", { name: /cuddle2piper/ })).toBeFocused();
});

test("refreshes and actions stay single-flight while the view remains responsive", async ({ page }) => {
  await page.goto("/e2e/quick-menu-harness.html?delay=500");
  await expect(page.getByRole("menuitem", { name: "设置", exact: true })).toBeVisible();
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("test-refresh"));
  });
  await expect(page.locator("body")).toHaveAttribute("data-present", /"revision":6/);
  await expect(page.locator("body")).toHaveAttribute("data-max-reads", "1");
  const before = Number(await page.locator("body").getAttribute("data-beats"));
  await page.getByRole("menuitem", { name: "设置", exact: true }).dblclick();
  await expect(page.locator("body")).toHaveAttribute("data-action-count", "1");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "隐藏悬浮球 / 卡片" })).toBeFocused();
  await expect.poll(async () => Number(await page.locator("body").getAttribute("data-beats"))).toBeGreaterThan(before + 3);
});
