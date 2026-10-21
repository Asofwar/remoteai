import { test, expect, type Page } from '@playwright/test';

async function openBrowser(page: Page, mode = 'local') {
  await page.goto(`/e2e/project-browser-harness.html?mode=${mode}`);
  if (mode === 'mobile') await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'src', exact: true })).toBeVisible();
}

async function openCode(page: Page) {
  await page.getByRole('treeitem', { name: 'src', exact: true }).click();
  await page.getByRole('treeitem', { name: 'main.ts', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '文件内容', exact: true })).toContainText('export function');
}

for (const mode of ['local', 'remote']) {
  test(`${mode}: tree, syntax, fold, find, edit/save, both resizers and conflict protection`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openBrowser(page, mode);
    const outer = page.getByRole('separator', { name: '调整文件浏览器宽度' });
    const before = Number(await outer.getAttribute('aria-valuenow'));
    const bounds = (await outer.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 180);
    await page.mouse.down(); await page.mouse.move(bounds.x - 90, bounds.y + 180); await page.mouse.up();
    await expect(outer).toHaveAttribute('aria-valuenow', String(before + 95));
    const split = page.getByRole('separator', { name: '调整文件树宽度' });
    const treeWidth = Number(await split.getAttribute('aria-valuenow'));
    await split.focus(); await page.keyboard.press('ArrowRight');
    await expect(split).toHaveAttribute('aria-valuenow', String(treeWidth + 20));
    await openCode(page);
    await expect(page.locator('.cm-content .ͼb, .cm-content .ͼd, .cm-content span[class]')).not.toHaveCount(0);
    await page.getByRole('button', { name: '全部折叠', exact: true }).click();
    await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
    await page.getByRole('button', { name: '全部展开', exact: true }).click();
    await page.getByRole('button', { name: '查找', exact: true }).click();
    await page.getByPlaceholder('查找', { exact: true }).fill('message');
    await expect(page.locator('.cm-searchMatch')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
    await editor.fill('export const saved = 42;\n');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { savedFiles: { text: string }[] }).savedFiles[0].text))
      .toBe('export const saved = 42;\n');
    await editor.fill('export const conflict = 1;\n');
    await page.evaluate(() => (window as unknown as { causeConflict: () => void }).causeConflict());
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('其他地方修改');
    await expect(editor).toContainText('conflict');
    await page.getByRole('button', { name: '关闭文件 main.ts', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor).toContainText('conflict');
    await page.screenshot({ path: `../../.codex-tmp/project-browser-${mode}.png` });
  });
}

test('mobile tool menu, file navigation, plain text, find, unsaved guard and keyboard-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBrowser(page, 'mobile');
  await expect(page.getByRole('separator', { name: '调整文件树宽度' })).toBeHidden();
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await page.getByLabel('文件自动保存', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
  await expect(editor).toContainText('Project notes');
  await expect(page.getByRole('tree')).toBeHidden();
  await expect(page.locator('.cm-line span[class]')).toHaveCount(0);
  await page.getByRole('button', { name: '全部折叠', exact: true }).click();
  await expect(page.locator('.cm-foldPlaceholder')).not.toHaveCount(0);
  await page.getByRole('button', { name: '全部展开', exact: true }).click();
  await editor.fill('my unsaved notes');
  await page.getByRole('button', { name: '返回文件列表' }).click();
  await page.getByRole('treeitem', { name: 'settings.json', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.getByRole('tab', { name: 'notes.txt', exact: true }).click();
  await expect(editor).toContainText('my unsaved notes');
  await page.getByRole('button', { name: '关闭文件 notes.txt', exact: true }).click();
  await page.getByRole('button', { name: '保存并继续' }).click();
  await expect(editor).toContainText('"enabled"');
  await page.setViewportSize({ width: 390, height: 430 });
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await page.getByPlaceholder('查找', { exact: true }).fill('enabled');
  await expect(page.locator('.pf-file-panel:not([hidden]) .cm-searchMatch')).not.toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../../.codex-tmp/project-browser-mobile.png' });
});

test('large/binary notices and drafts survive disconnection and viewport changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBrowser(page);
  await page.getByRole('treeitem', { name: 'huge.txt', exact: true }).click();
  await expect(page.getByText('文件超过 2 MB，暂不支持在这里编辑。', { exact: true })).toBeVisible();
  await page.getByRole('treeitem', { name: 'archive.zip', exact: true }).click();
  await expect(page.getByText('此文件暂不支持预览。', { exact: true })).toBeVisible();
  await openCode(page);
  const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
  await editor.fill('my draft');
  await page.getByRole('button', { name: '切换连接', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toContainText('my draft');
});
