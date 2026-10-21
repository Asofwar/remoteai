import { test, expect, type Page } from '@playwright/test';
import { longPress } from './project-browser-touch';

const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const treeFile = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: '文件内容', exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/project-browser-harness.html?mode=standalone');
});

test('tree submenus open beside the hovered row and remain reachable across the gap', async ({ page }) => {
  await treeFile(page, 'src').click({ button: 'right' });
  const main = page.getByRole('menu', { name: '文件操作', exact: true });
  await expect(page.getByRole('menu', { name: '新建', exact: true })).toHaveCount(0);
  await item(page, '新建').hover();
  const submenu = page.getByRole('menu', { name: '新建', exact: true });
  await expect(submenu).toBeVisible();
  await expect(item(page, '复制')).toBeVisible();
  const bounds = (await main.boundingBox())!, child = (await submenu.boundingBox())!;
  expect(child.x).toBeGreaterThanOrEqual(bounds.x + bounds.width);
  await item(page, '新建文件夹').hover();
  await page.waitForTimeout(220);
  await expect(submenu).toBeVisible();
  await page.screenshot({ path: '../../.codex-tmp/project-browser-hover.png' });
  await item(page, '新建文件夹').click();
  await expect(page.getByRole('alertdialog', { name: '新建文件夹' })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await treeFile(page, 'src').click({ button: 'right' });
  await item(page, '打开位置').hover();
  await item(page, '终端').hover();
  await page.waitForTimeout(220);
  await item(page, '终端').click();
  expect(await page.evaluate(() => (window as unknown as {
    browserActions: { path: string; action: string }[];
  }).browserActions)).toEqual([{ path: 'C:/project/src', action: 'terminal' }]);
  await treeFile(page, 'notes.txt').click({ button: 'right' });
  await expect(item(page, '新建')).toHaveCount(0);
  await item(page, '打开位置').hover();
  await expect(page.getByRole('menu', { name: '打开位置', exact: true })).toBeVisible();
  await item(page, '系统文件浏览器').click();
  expect(await page.evaluate(() => (window as unknown as {
    browserActions: { path: string; action: string }[];
  }).browserActions.at(-1))).toEqual({ path: 'C:/project/notes.txt', action: 'explorer' });
});

test('submenus flip at the right edge, stay above the bottom edge and support keyboard return', async ({ page }) => {
  await treeFile(page, 'src').evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu',
    { bubbles: true, clientX: 1425, clientY: 980 })));
  const main = page.getByRole('menu', { name: '文件操作', exact: true });
  await expect(main).toHaveCSS('left', '1200px');
  await item(page, '打开位置').hover();
  const popup = page.getByRole('menu', { name: '打开位置', exact: true });
  const bounds = (await main.boundingBox())!, child = (await popup.boundingBox())!;
  expect(child.x + child.width).toBeLessThanOrEqual(bounds.x);
  expect(child.y + child.height).toBeLessThanOrEqual(992);
  await item(page, '打开位置').focus();
  await page.keyboard.press('ArrowRight');
  await expect(item(page, '系统文件浏览器')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(item(page, '终端')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(popup).toHaveCount(0);
  await expect(item(page, '打开位置')).toBeFocused();
  await item(page, '新建').hover();
  await item(page, '复制').hover();
  await expect(page.getByRole('menu', { name: '新建', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(main).toHaveCount(0);
});

test('tab menu copies and renames the target, then closes only tabs to its right', async ({ page }) => {
  for (const name of ['notes.txt', 'settings.json', 'README.md']) await treeFile(page, name).click();
  await tab(page, 'notes.txt').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '标签页操作' }).getByRole('menuitem')).toHaveCount(11);
  await item(page, '复制路径').click();
  await expect(page.getByRole('status').filter({ hasText: '路径已复制。' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {
    browserActions: { path: string; action: string }[];
  }).browserActions.at(-1))).toEqual({ path: 'C:/project/notes.txt', action: 'copyPath' });
  await tab(page, 'notes.txt').click({ button: 'right' });
  await item(page, '重命名').click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('renamed.txt');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(treeFile(page, 'renamed.txt')).toBeVisible();
  await expect(treeFile(page, 'notes.txt')).toHaveCount(0);
  await expect(tab(page, 'renamed.txt')).toBeVisible();
  await tab(page, 'settings.json').click({ button: 'right' });
  await item(page, '关闭右侧标签页').click();
  await expect(tab(page, 'README.md')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await tab(page, 'settings.json').click({ button: 'right' });
  await item(page, '关闭其他标签页').click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await tab(page, 'settings.json').focus();
  await page.keyboard.press('Control+F4');
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('batch close preserves drafts on cancel, skips modified files and saves before closing', async ({ page }) => {
  await treeFile(page, 'notes.txt').click(); await editor(page).fill('notes draft');
  await treeFile(page, 'settings.json').click(); await editor(page).fill('settings draft');
  await treeFile(page, 'README.md').click();
  await tab(page, 'README.md').click({ button: 'right' });
  await item(page, '关闭所有标签页').click();
  await expect(page.getByRole('alertdialog')).toContainText('notes.txt');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('settings.json');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await tab(page, 'notes.txt').click(); await expect(editor(page)).toContainText('notes draft');
  await tab(page, 'notes.txt').click({ button: 'right' });
  await item(page, '关闭未修改的标签页').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await tab(page, 'notes.txt').click({ button: 'right' });
  await item(page, '关闭所有标签页').click();
  await page.getByRole('button', { name: '保存并继续', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('settings.json');
  await page.getByRole('button', { name: '保存并继续', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { savedFiles: { text: string }[] }).savedFiles
    .map(file => file.text))).toEqual(['notes draft', 'settings draft']);
});

test('a failed save stops batch close and retains every draft', async ({ page }) => {
  await treeFile(page, 'notes.txt').click(); await editor(page).fill('keep these changes');
  await treeFile(page, 'settings.json').click();
  await page.evaluate(() => (window as unknown as { causeConflict: () => void }).causeConflict());
  await tab(page, 'settings.json').click({ button: 'right' });
  await item(page, '关闭所有标签页').click();
  await page.getByRole('button', { name: '保存并继续', exact: true }).click();
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('其他地方修改');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await tab(page, 'notes.txt').click();
  await expect(editor(page)).toContainText('keep these changes');
});

test.describe('touch menus', () => {
  test.use({ hasTouch: true });
  test('keeps narrow tree submenus tappable and opens the tab menu on long press', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await longPress(page, treeFile(page, 'src'));
    await item(page, '新建').tap();
    await expect(item(page, '返回')).toBeVisible();
    await item(page, '新建文件').tap();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('touch.txt');
    await page.getByRole('button', { name: '确定', exact: true }).tap();
    await expect(tab(page, 'touch.txt')).toBeVisible();
    await longPress(page, tab(page, 'touch.txt'), '标签页操作');
    const bounds = (await page.getByRole('menu', { name: '标签页操作' }).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await item(page, '向右拆分').tap();
    await expect(page.locator('.pf-editor-pane')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: '../../.codex-tmp/project-browser-touch-split.png' });
  });
});
