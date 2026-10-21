import { test, expect, type Page } from '@playwright/test';
import { longPress } from './project-browser-touch';

async function open(page: Page, mode = 'remote') {
  await page.goto(`/e2e/project-browser-harness.html?mode=${mode}`);
  if (mode === 'mobile') await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
}
const row = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true });
const menu = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
async function create(page: Page, name: string, folder: boolean) {
  await menu(page, '新建').click();
  await menu(page, folder ? '新建文件夹' : '新建文件').click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill(name);
  await page.getByRole('button', { name: '确定', exact: true }).click();
}

test('folder actions: create, rename with draft, copy, cut, paste and delete', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole('button', { name: '项目文件夹操作' }).click();
  await expect(menu(page, '删除')).toBeDisabled();
  await create(page, '新目录', true);
  await row(page, '新目录').click({ button: 'right' });
  await expect(menu(page, '下载为 ZIP')).toBeVisible();
  await expect(menu(page, '打开位置')).toHaveCount(0);
  await create(page, '草稿.txt', false);
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await page.getByLabel('文件自动保存', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
  await editor.fill('keep draft');
  await row(page, '新目录').click({ button: 'right' }); await menu(page, '重命名').click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('改名目录');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(editor).toContainText('keep draft');
  await expect(page.locator('.pf-file-path')).toContainText('改名目录/草稿.txt');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await row(page, '改名目录').click({ button: 'right' }); await menu(page, '复制').click();
  await page.getByRole('button', { name: '项目文件夹操作' }).click(); await menu(page, '粘贴').click();
  await expect(row(page, '改名目录 (copy)')).toBeVisible();
  await row(page, '改名目录').click({ button: 'right' }); await menu(page, '剪切').click();
  await expect(row(page, '改名目录')).toHaveAttribute('data-cut', 'true');
  await row(page, 'src').click({ button: 'right' }); await menu(page, '粘贴').click();
  await expect(page.locator('.pf-file-path')).toContainText('src/改名目录/草稿.txt');
  await row(page, '改名目录').click({ button: 'right' }); await menu(page, '删除').click();
  await expect(page.getByRole('alertdialog')).toContainText('无法撤销');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(row(page, '改名目录')).toBeVisible();
  await row(page, '改名目录').click({ button: 'right' }); await menu(page, '删除').click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(row(page, '改名目录')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '草稿.txt', exact: true })).toHaveCount(0);
  await expect(row(page, '改名目录 (copy)')).toBeVisible();
});

test.describe('phone gestures', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('long press opens a compact menu; tap navigates and movement cancels the press', async ({ page }) => {
    await open(page, 'mobile');
    const folder = row(page, 'src');
    await longPress(page, folder);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page, '下载为 ZIP')).toBeVisible();
    const rect = (await page.getByRole('menu', { name: '文件操作' }).boundingBox())!;
    expect(rect.width).toBeLessThanOrEqual(400); expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: '../../.codex-tmp/project-browser-longpress.png' });
    await page.keyboard.press('Escape');
    await folder.tap();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await row(page, 'main.ts').tap();
    await expect(page.getByRole('textbox', { name: '文件内容', exact: true })).toContainText('function');
    await page.getByRole('button', { name: '返回文件列表' }).click();
    const bounds = (await folder.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const point = { x: bounds.x + 55, y: bounds.y + bounds.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ ...point, y: point.y + 45 }] });
    await page.waitForTimeout(650);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await expect(page.getByRole('menu', { name: '文件操作' })).toHaveCount(0);
  });
});
