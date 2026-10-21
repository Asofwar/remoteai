import { test, expect, type Locator, type Page } from '@playwright/test';

const editor = (scope: Locator) => scope.getByRole('textbox', { name: '文件内容', exact: true });
async function menu(page: Page, target: Locator, command: string) {
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: command, exact: true }).click();
}

for (const mode of ['local', 'remote']) {
  test(`${mode}: split views share drafts, preserve history, resize and reopen with their layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/e2e/project-browser-harness.html?mode=${mode}`);
    await page.getByRole('button', { name: '文件浏览', exact: true }).click();
    await page.getByRole('button', { name: '展开文件浏览器' }).click();
    await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
    await page.getByRole('button', { name: '文件浏览设置' }).click();
    await page.getByLabel('文件自动保存', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: '文件浏览设置' }).click();
    const first = page.locator('.pf-editor-pane').first();
    await editor(first).fill('shared draft');
    await menu(page, first.getByRole('tab', { name: 'notes.txt', exact: true }), '向右拆分');
    const panes = page.locator('.pf-editor-pane');
    await expect(panes).toHaveCount(2);
    const second = panes.nth(1);
    await expect(editor(second)).toContainText('shared draft');
    await first.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(editor(first)).toContainText('Project notes');
    await expect(editor(second)).toContainText('Project notes');
    await first.getByRole('button', { name: '重做', exact: true }).click();
    await expect(editor(second)).toContainText('shared draft');
    await editor(second).fill('updated from right');
    await expect(editor(first)).toContainText('updated from right');
    await editor(second).press('Control+s');
    await expect(page.locator('.pf-dirty-dot')).toHaveCount(0);
    const left = (await first.boundingBox())!, right = (await second.boundingBox())!;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
    const divider = page.getByRole('separator', { name: '调整编辑区域大小' });
    await divider.focus(); await page.keyboard.press('ArrowLeft');
    await expect(divider).toHaveAttribute('aria-valuenow', '45');
    const handle = (await divider.boundingBox())!;
    await page.mouse.move(handle.x, handle.y + 200);
    await page.mouse.down(); await page.mouse.move(handle.x - 30, handle.y + 200); await page.mouse.up();
    await expect.poll(async () => Number(await divider.getAttribute('aria-valuenow'))).toBeLessThan(45);
    await divider.focus(); await page.keyboard.press('ArrowRight');
    const ratio = await divider.getAttribute('aria-valuenow');
    await page.getByRole('button', { name: '关闭详情抽屉' }).click();
    await page.getByRole('button', { name: '文件浏览', exact: true }).click();
    await expect(panes).toHaveCount(2);
    await expect(divider).toHaveAttribute('aria-valuenow', ratio!);
    await page.screenshot({ path: `../../.codex-tmp/project-browser-split-${mode}.png`, animations: 'disabled' });
    await second.getByRole('button', { name: '关闭文件 notes.txt', exact: true }).click();
    await expect(panes).toHaveCount(1);
    await expect(editor(first)).toContainText('updated from right');
  });
}

test('nested split and move actions keep distinct tab groups and rename all duplicate views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/project-browser-harness.html?mode=standalone');
  for (const name of ['notes.txt', 'settings.json', 'README.md']) {
    await page.getByRole('treeitem', { name, exact: true }).click();
  }
  const panes = page.locator('.pf-editor-pane');
  const first = panes.first();
  await menu(page, first.getByRole('tab', { name: 'settings.json', exact: true }), '拆分并移到右侧');
  await expect(first.getByRole('tab', { name: 'settings.json', exact: true })).toHaveCount(0);
  await expect(panes.nth(1).getByRole('tab', { name: 'settings.json', exact: true })).toBeVisible();
  await menu(page, first.getByRole('tab', { name: 'README.md', exact: true }), '拆分并移到下方');
  await expect(panes).toHaveCount(3);
  const top = (await first.boundingBox())!, bottom = (await panes.nth(1).boundingBox())!;
  expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
  await menu(page, first.getByRole('tab', { name: 'notes.txt', exact: true }), '向下拆分');
  await expect(panes).toHaveCount(4);
  await editor(first).fill('rename draft');
  await menu(page, first.getByRole('tab', { name: 'notes.txt', exact: true }), '重命名');
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('split-renamed.txt');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'split-renamed.txt', exact: true })).toHaveCount(2);
  await expect(editor(first)).toContainText('rename draft');
  await first.getByRole('button', { name: '关闭文件 split-renamed.txt', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'split-renamed.txt', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '关闭文件 split-renamed.txt', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('split-renamed.txt');
  await page.getByRole('button', { name: '取消', exact: true }).click();
});
