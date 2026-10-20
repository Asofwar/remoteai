import { expect, test } from '@playwright/test';

for (const width of [390, 820]) {
  test(`Git icons, rollback and context actions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/git-actions.html');
    const rollback = page.getByRole('button', { name: '回退所选文件', exact: true });
    await expect(rollback).toBeDisabled();
    await expect(page.locator('.git-toolbar-actions button svg')).toHaveCount(6);
    await expect(page.locator('.git-tracking-branches')).toHaveText('main → origin/main');
    const selected = page.getByRole('checkbox', { name: '选择 src/app.ts', exact: true });
    await selected.check();
    const draft = page.getByRole('textbox', { name: '提交说明', exact: true });
    await draft.fill('保留草稿');
    await page.getByRole('button', { name: '查看 README.md', exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menuitem')).toHaveCount(3);
    await expect(page.locator('.git-file-context-menu')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('context-menu.png'), animations: 'disabled' });
    await page.getByRole('menuitem', { name: '提交单个文件', exact: true }).click();
    const commit = page.getByRole('dialog', { name: '提交单个文件', exact: true });
    await expect(commit).toContainText('README.md');
    await expect(commit).not.toContainText('src/app.ts');
    await commit.getByRole('textbox', { name: '单文件提交说明' }).fill('只提交说明文件');
    await commit.getByRole('button', { name: '提交', exact: true }).click();
    await expect(commit).toBeHidden();
    await expect(page.getByRole('button', { name: '查看 README.md', exact: true })).toHaveCount(0);
    await expect(selected).toBeChecked();
    await expect(draft).toHaveValue('保留草稿');
    await rollback.click();
    const confirmation = page.getByRole('dialog', { name: '回退文件', exact: true });
    await expect(confirmation).toContainText('src/app.ts');
    expect((await confirmation.boundingBox())!.width).toBeLessThanOrEqual(400);
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(selected).toBeChecked();
    await rollback.click();
    await confirmation.getByRole('button', { name: '确认回退', exact: true }).click();
    await expect(selected).toHaveCount(0);
    const newFile = page.getByRole('button', { name: '查看 新文件 [1].txt', exact: true });
    await newFile.scrollIntoViewIfNeeded();
    await newFile.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除文件', exact: true }).click();
    await page.getByRole('dialog', { name: '删除文件' }).getByRole('button', { name: '确认删除' }).click();
    await expect(newFile).toHaveCount(0);
    const single = page.getByRole('button', { name: '查看 src/theme.css', exact: true });
    await single.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '回退单个文件', exact: true }).click();
    await expect(confirmation).toContainText('src/theme.css');
    await confirmation.getByRole('button', { name: '确认回退', exact: true }).click();
    await expect(single).toHaveCount(0);
    await expect(page.getByRole('button', { name: '查看 src/chat/tools.ts', exact: true })).toBeVisible();
  });

  test(`Git shows the complete long branch at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/git-actions.html?longBranch');
    const branch = page.locator('.git-tracking-branches');
    await expect(branch).toContainText(' → origin/feature/');
    expect(await branch.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('long-branch.png') });
  });
}
