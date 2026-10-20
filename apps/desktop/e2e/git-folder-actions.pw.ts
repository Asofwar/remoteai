import { expect, test } from '@playwright/test';

const actions = [
  { menu: '提交文件夹内改动', title: '提交 2 个文件', confirm: '提交', kind: 'commit' },
  { menu: '回退文件夹内改动', title: '回退文件', confirm: '确认回退', kind: 'rollback' },
  { menu: '删除文件夹内改动文件', title: '删除文件', confirm: '确认删除', kind: 'delete' },
];

for (const width of [390, 820]) {
  for (const action of actions) {
    test(`${action.kind} includes collapsed folder descendants at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/e2e/git-actions.html');
      const selected = page.getByRole('checkbox', { name: '选择 README.md', exact: true });
      await selected.check();
      const draft = page.getByRole('textbox', { name: '提交说明', exact: true });
      await draft.fill('保留其他文件的草稿');
      const folder = page.getByRole('button', { name: '展开或收起 src/chat', exact: true });
      await folder.click();
      await expect(page.getByRole('button', { name: '查看 src/chat/tools.ts', exact: true })).toHaveCount(0);
      await folder.scrollIntoViewIfNeeded();
      await folder.click({ button: 'right' });
      await expect(page.getByRole('menuitem')).toHaveCount(3);
      await expect(page.locator('.git-file-context-menu')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: info.outputPath('folder-menu.png'), animations: 'disabled' });
      await page.getByRole('menuitem', { name: action.menu, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: action.title, exact: true });
      await expect(dialog.locator('li')).toHaveText(['src/chat/tools.ts', 'src/chat/menu.ts']);
      expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(400);
      await page.screenshot({ path: info.outputPath('folder-confirmation.png'), animations: 'disabled' });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(folder).toBeVisible();
      await expect(selected).toBeChecked();
      await folder.scrollIntoViewIfNeeded();
      await folder.click({ button: 'right' });
      await page.getByRole('menuitem', { name: action.menu, exact: true }).click();
      if (action.kind === 'commit') await dialog.getByRole('textbox').fill('提交 chat 文件夹');
      await dialog.getByRole('button', { name: action.confirm, exact: true }).click();
      await expect(dialog).toBeHidden();
      if (action.kind === 'delete') {
        await folder.click();
        const files = page.locator('.git-file-file')
          .filter({ has: page.getByRole('button', { name: /查看 src\/chat\// }) });
        await expect(files.locator('.git-status')).toHaveText(['D', 'D']);
      } else await expect(folder).toHaveCount(0);
      await expect(selected).toBeChecked();
      await expect(draft).toHaveValue('保留其他文件的草稿');
      await expect(page.getByRole('button', { name: '查看 src/app.ts', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '查看 src/theme.css', exact: true })).toBeVisible();
    });
  }
}

test('folder deletion skips deleted files and is disabled when all descendants are deleted', async ({ page }) => {
  await page.goto('/e2e/git-actions.html');
  const file = page.getByRole('button', { name: '查看 src/chat/tools.ts', exact: true });
  await file.scrollIntoViewIfNeeded();
  await file.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除文件', exact: true });
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).toBeHidden();
  const folder = page.getByRole('button', { name: '展开或收起 src/chat', exact: true });
  await folder.click();
  await folder.scrollIntoViewIfNeeded();
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除文件夹内改动文件', exact: true }).click();
  await expect(dialog.locator('li')).toHaveText(['src/chat/menu.ts']);
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).toBeHidden();
  await folder.scrollIntoViewIfNeeded();
  await folder.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '删除文件夹内改动文件', exact: true })).toBeDisabled();
  await page.getByRole('menuitem', { name: '回退文件夹内改动', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '回退文件', exact: true }).locator('li'))
    .toHaveText(['src/chat/tools.ts', 'src/chat/menu.ts']);
});
