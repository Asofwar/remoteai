import { expect, type Page } from "@playwright/test";

export async function checkThreadSidebarResize(page: Page) {
  const handle = page.getByRole("separator", { name: "调整聊天列表宽度" });
  const sidebar = handle.locator("..");
  await expect(handle).toHaveAttribute("aria-valuenow", "236");
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await expect(handle).toHaveCSS("cursor", "col-resize");
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 5 });
  await expect(sidebar).toHaveCSS("width", "336px");
  await expect(page.locator("body")).toHaveCSS("user-select", "none");
  await page.mouse.up();
  await expect(page.locator("body")).not.toHaveCSS("cursor", "col-resize");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("codex-switch:gui-sidebar-width"))).toBe("336");

  await handle.press("ArrowRight");
  await expect(sidebar).toHaveCSS("width", "352px");
  await handle.press("Home");
  await expect(sidebar).toHaveCSS("width", "200px");
  await handle.press("End");
  await expect(sidebar).toHaveCSS("width", "520px");
  await handle.dblclick();
  await expect(sidebar).toHaveCSS("width", "236px");

  const reset = (await handle.boundingBox())!;
  await page.mouse.move(reset.x + reset.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(reset.x + 80, y);
  await handle.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(sidebar).toHaveCSS("width", "236px");
  await expect(page.locator("body")).not.toHaveCSS("cursor", "col-resize");
  await handle.press("End");
}
