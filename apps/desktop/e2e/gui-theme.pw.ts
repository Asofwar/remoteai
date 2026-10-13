import { test, expect, type Page } from "@playwright/test";

async function selectBackground(page: Page, mode: "inherit" | "custom") {
  await page.getByRole("tab", { name: "皮肤", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "皮肤", exact: true });
  if (mode === "inherit") {
    await panel.getByText("跟随皮肤页", { exact: true }).click();
  } else {
    await panel.getByPlaceholder("搜索皮肤").fill("preset-rose-reverie");
    await panel.locator("article").first().getByRole("button").click();
  }
  await expect(page.getByLabel("皮肤效果")).toHaveAttribute("data-dream-skin", "true");
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  await expect(page.getByRole("radio", { name: "跟随应用", exact: true })).toBeChecked();
  await page.getByRole("button", { name: /^完\s*成$/ }).click();
}

async function expectAppPalette(page: Page, mode: "light" | "dark") {
  const effect = page.getByLabel("皮肤效果");
  await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
  await expect(effect).toHaveCSS("color-scheme", mode);
  await expect(effect).toHaveCSS("color", mode === "light" ? "rgb(23, 33, 27)" : "rgb(230, 232, 235)");
  for (const variable of ["--panel", "--ink", "--muted", "--line", "--green-soft", "--green-selection"]) {
    const appValue = await page.locator("html").evaluate((element, name) =>
      getComputedStyle(element).getPropertyValue(name).trim(), variable);
    await expect(effect).toHaveCSS(variable, appValue);
  }
}

for (const width of [1440, 960]) {
  for (const mode of ["inherit", "custom"] as const) {
    test(`GUI follows application appearance with ${mode} skin at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/e2e/gui-skin-harness.html?shared&dark");
      await selectBackground(page, mode);
      const effect = page.getByLabel("皮肤效果");
      const image = await effect.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--gui-skin-image"));
      for (const appearance of ["light", "dark"] as const) {
        await page.getByRole("button", {
          name: appearance === "light" ? "切换到明亮主题" : "切换到暗黑主题",
        }).click();
        await expectAppPalette(page, appearance);
        await expect(effect).toHaveCSS("--gui-skin-image", image);
        await expect(effect).toHaveCSS("--gui-skin-overlay", "80%");
        await page.screenshot({ path: `../../.codex-tmp/gui-theme-${mode}-${width}-${appearance}.png`,
          animations: "disabled" });
      }
      await page.reload();
      await expectAppPalette(page, "dark");
      await expect(effect).toHaveCSS("--gui-skin-image", image);
      expect(errors).toEqual([]);
    });
  }
}
