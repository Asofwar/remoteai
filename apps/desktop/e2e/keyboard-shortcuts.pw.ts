import { test, expect, type Page } from '@playwright/test';

const row = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true })
  .locator('..').locator('..');

async function choose(page: Page, title: string, modifiers: string[], key: string) {
  await row(page, title).getByRole('button', { name: /^设\s*置$/ }).click();
  const dialog = page.getByRole('dialog');
  for (const modifier of ['Ctrl', 'Alt', 'Shift']) {
    await dialog.getByRole('checkbox', { name: modifier, exact: true }).setChecked(modifiers.includes(modifier));
  }
  await dialog.getByLabel('按键', { exact: true }).selectOption(key);
  await dialog.getByRole('button', { name: '保 存' }).click();
}

for (const width of [1280, 390]) {
  test(`defaults, reassignment, conflict, persistence and reset at ${width}px`, async ({ page }) => {
    page.on('pageerror', error => console.error(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/keyboard-shortcuts-harness.html', { waitUntil: 'domcontentloaded' });
    // The first visit compiles the desktop dependency graph on a cold Vite server.
    await expect(row(page, '系统截屏')).toContainText('Alt + Shift + S', { timeout: 60_000 });
    await expect(page.getByText('未设置', { exact: true })).toHaveCount(4);
    await choose(page, '打开设置', ['Ctrl', 'Alt'], 'KeyP');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row(page, '打开设置')).toContainText('Ctrl + Alt + P');
    await page.reload();
    await expect(row(page, '打开设置')).toContainText('Ctrl + Alt + P');
    await choose(page, '系统截屏', ['Ctrl', 'Alt'], 'KeyP');
    await expect(page.getByRole('dialog')).toContainText('这个组合键已用于其他操作，请换一个。');
    await expect(row(page, '系统截屏')).toContainText('Alt + Shift + S');
    expect((await page.getByRole('dialog').boundingBox())!.width).toBeLessThanOrEqual(400);
    await page.screenshot({ path: `../../.codex-tmp/shortcuts-conflict-${width}.png` });
    await page.getByRole('dialog').getByRole('button', { name: '取 消' }).click();
    await choose(page, '系统截屏', ['Ctrl', 'Alt'], 'Digit9');
    await expect(page.getByRole('dialog')).toContainText('可能已被其他应用占用');
    await page.getByRole('dialog').getByRole('button', { name: '取 消' }).click();
    await choose(page, '系统截屏', ['Ctrl', 'Shift'], 'KeyS');
    await expect(row(page, '系统截屏')).toContainText('Ctrl + Shift + S');
    await row(page, '系统截屏').getByRole('button', { name: '清 除' }).click();
    await expect(row(page, '系统截屏')).toContainText('未设置');
    await page.reload();
    await expect(row(page, '系统截屏')).toContainText('未设置');
    await row(page, '系统截屏').getByRole('button', { name: '恢复默认' }).click();
    await expect(row(page, '系统截屏')).toContainText('Alt + Shift + S');
    await page.screenshot({ path: `../../.codex-tmp/shortcuts-settings-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
