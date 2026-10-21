import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, mode: string) {
  if (mode === 'mobile') await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
}
const editor = (page: Page) => page.getByRole('textbox', { name: '文件内容', exact: true });
async function preferences(page: Page, delay: string) {
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await page.getByLabel('文件自动保存', { exact: true }).selectOption(delay);
  await page.getByRole('button', { name: '文件浏览设置' }).click();
}
for (const mode of ['local', 'remote', 'mobile']) {
  test(`${mode}: tabs preserve drafts, history, close guard, Ctrl+S and drawer reopen`, async ({ page }) => {
    await page.setViewportSize({ width: mode === 'mobile' ? 390 : 1440, height: 900 });
    await page.goto(`/e2e/project-browser-harness.html?mode=${mode}`);
    await open(page, mode);
    await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
    await preferences(page, '0');
    await editor(page).fill('draft one');
    await expect(page.getByRole('tab', { name: 'notes.txt', exact: true }).locator('.pf-dirty-dot')).toBeVisible();
    if (mode === 'mobile') await page.getByRole('button', { name: '返回文件列表' }).click();
    await page.getByRole('treeitem', { name: 'settings.json', exact: true }).click();
    await editor(page).fill('draft two');
    await page.getByRole('tab', { name: 'notes.txt', exact: true }).click();
    await expect(editor(page)).toContainText('draft one');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(editor(page)).toContainText('Project notes');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(editor(page)).toContainText('draft one');
    await page.getByRole('button', { name: '关闭详情抽屉' }).click();
    await expect(page.getByRole('dialog', { name: '文件浏览', exact: true })).toBeHidden();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await open(page, mode);
    await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-tabs').getByRole('tab')).toHaveCount(2);
    await expect(editor(page)).toContainText('draft one');
    await expect(page.getByRole('tab', { name: 'settings.json' }).locator('.pf-dirty-dot')).toBeVisible();
    await page.getByRole('button', { name: '关闭详情抽屉' }).focus();
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('tab', { name: 'notes.txt' }).locator('.pf-dirty-dot')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭文件 settings.json', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('settings.json');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-tabs').getByRole('tab')).toHaveCount(2);
    await page.getByRole('button', { name: '关闭文件 settings.json', exact: true }).click();
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-tabs').getByRole('tab')).toHaveCount(1);
    await page.screenshot({ path: `../../.codex-tmp/project-browser-tabs-${mode}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(mode === 'mobile' ? 390 : 1440);
  });
}

test('default auto-save saves inactive tabs and settings survive browser reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/project-browser-harness.html');
  await open(page, 'local');
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await expect(page.getByLabel('文件自动保存', { exact: true })).toHaveValue('1000');
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await editor(page).fill('automatically saved');
  await page.getByRole('treeitem', { name: 'settings.json', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'notes.txt' }).locator('.pf-dirty-dot')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { savedFiles: { text: string }[] }).savedFiles.at(-1)?.text))
    .toBe('automatically saved');
  await preferences(page, '5000');
  await page.reload();
  await open(page, 'local');
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await expect(page.getByLabel('文件自动保存', { exact: true })).toHaveValue('5000');
});

test('drawer restores each project independently after switching projects', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/project-browser-harness.html');
  await open(page, 'local');
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await preferences(page, '0');
  await editor(page).fill('project one draft');
  await page.getByRole('treeitem', { name: 'settings.json', exact: true }).click();
  await editor(page).fill('project one settings');
  await page.getByRole('button', { name: '关闭详情抽屉' }).click();
  await page.getByRole('button', { name: '切换项目' }).click();
  await open(page, 'local');
  await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-tabs').getByRole('tab')).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await expect(editor(page)).toContainText('Project notes');
  await editor(page).fill('project two draft');
  await page.getByRole('button', { name: '关闭详情抽屉' }).click();
  await page.getByRole('button', { name: '切换项目' }).click();
  await open(page, 'local');
  await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-tabs').getByRole('tab')).toHaveCount(2);
  await expect(editor(page)).toContainText('project one settings');
  await page.getByRole('tab', { name: 'notes.txt', exact: true }).click();
  await expect(editor(page)).toContainText('project one draft');
  await expect(page.locator('.project-browser-drawer:not([hidden]) .pf-dirty-dot')).toHaveCount(2);
  await page.screenshot({ path: '../../.codex-tmp/project-browser-project-drafts.png' });
});
