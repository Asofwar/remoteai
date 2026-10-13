import { expect, test, type Locator, type Page } from "@playwright/test";

const ORDER_KEY = "codex-switch:account-table-order";
const SORT_KEY = "codex-switch:account-table-usage-sort";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("codex-switch:language", "zh");
    localStorage.setItem("codex-switch:account-display-mode", "table");
    localStorage.setItem("codex-switch:local-proxy-running", "true");
    localStorage.setItem("codex-switch:hide-account-notes", "true");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "账户管理", exact: true }).click();
  await expect(page.getByRole("button", { name: "账号排序", exact: true })).toBeVisible();
}

function tableRows(page: Page) {
  return page.locator(".accounts-page .ant-table-tbody > tr[data-row-key]");
}

async function rowIds(rows: Locator, attribute = "data-row-key") {
  return rows.evaluateAll((elements, name) => elements.map((element) => element.getAttribute(name)), attribute);
}

async function dragAccount(page: Page, rows: Locator, from: number, to: number) {
  await expect(page.locator(".ant-modal")).toHaveCSS("transform", "none");
  const grip = rows.nth(from).getByRole("button", { name: "拖动排序" });
  await grip.hover();
  const handle = await grip.boundingBox();
  const target = await rows.nth(to).boundingBox();
  if (!handle || !target) throw new Error("Account drag target is not visible");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("drag order saves, clears column sorting, survives reload and preserves privacy", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page);
  const initial = await rowIds(tableRows(page));
  await page.getByRole("columnheader", { name: "账号", exact: false }).first().click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SORT_KEY)).not.toBeNull();
  await page.getByRole("button", { name: "账号排序", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "账号排序" });
  const rows = dialog.locator("li[data-account-order-id]");
  await expect(rows.first()).toContainText("*");
  await expect(dialog).not.toContainText("alex.chen@example.com");
  await expect(dialog).not.toContainText("Personal account for experiments");
  await dragAccount(page, rows, 0, 2);
  const expected = [initial[1], initial[2], initial[0], ...initial.slice(3)];
  await expect.poll(() => rowIds(rows, "data-account-order-id")).toEqual(expected);
  await page.screenshot({ path: "../../.codex-tmp/account-order-light.png" });
  await dialog.getByRole("button", { name: "保存顺序", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await rowIds(tableRows(page))).toEqual(expected);
  expect(await page.evaluate((key) => localStorage.getItem(key), SORT_KEY)).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "账户管理", exact: true }).click();
  await expect(tableRows(page)).toHaveCount(expected.length);
  expect(await rowIds(tableRows(page))).toEqual(expected);
  expect(errors).toEqual([]);
});

test("cancel discards keyboard changes and storage failure keeps the draft open", async ({ page }) => {
  await prepare(page);
  const initial = await rowIds(tableRows(page));
  await page.getByRole("button", { name: "账号排序", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "账号排序" });
  const rows = dialog.locator("li[data-account-order-id]");
  await rows.first().getByRole("button", { name: "拖动排序" }).press("ArrowDown");
  expect((await rowIds(rows, "data-account-order-id"))[0]).toBe(initial[1]);
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  expect(await rowIds(tableRows(page))).toEqual(initial);
  expect(await page.evaluate((key) => localStorage.getItem(key), ORDER_KEY)).toBeNull();
  await page.getByRole("button", { name: "切换到暗黑主题", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.getByRole("button", { name: "账号排序", exact: true }).click();
  expect(await rowIds(rows, "data-account-order-id")).toEqual(initial);
  await rows.first().getByRole("button", { name: "下移" }).click();
  await page.screenshot({ path: "../../.codex-tmp/account-order-dark.png" });
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, ORDER_KEY);
  await dialog.getByRole("button", { name: "保存顺序", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("未能保存排序，请重试。");
  expect((await rowIds(rows, "data-account-order-id"))[0]).toBe(initial[1]);
  expect(await rowIds(tableRows(page))).toEqual(initial);
});
