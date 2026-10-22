import { expect, test, type Locator, type Page } from '@playwright/test';
import { longPress } from './project-browser-touch';
import { browserRoot } from './project-browser-fixture';

async function openEditor(page: Page, mode: string) {
  await page.setViewportSize({ width: mode === 'mobile' ? 390 : 1440, height: 900 });
  await page.goto(`/e2e/project-browser-harness.html?mode=${mode}`);
  if (mode === 'mobile') await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  await page.getByRole('treeitem', { name: 'notes.txt', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  await page.getByLabel('文件自动保存', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '文件浏览设置' }).click();
  return page.getByRole('textbox', { name: '文件内容', exact: true });
}

async function selectPassage(editor: Locator) {
  await editor.fill('first\n  chosen 中文\nlast value\n');
  await editor.press('Control+Home');
  await editor.press('ArrowDown');
  await editor.press('Home');
  await editor.press('Shift+End');
  for (let index = 0; index < 5; index++) await editor.press('Shift+ArrowRight');
}

async function rightClickSelection(page: Page) {
  const rect = await page.evaluate(() => {
    const box = window.getSelection()!.getRangeAt(0).getClientRects()[0];
    return { x: box.x + 4, y: box.y + box.height / 2 };
  });
  await page.mouse.click(rect.x, rect.y, { button: 'right' });
}

for (const mode of ['local', 'remote', 'web']) {
  test(`${mode}: right-click quotes the exact file range without replacing the chat draft`, async ({ page }) => {
    const editor = await openEditor(page, mode);
    await selectPassage(editor);
    await rightClickSelection(page);
    const menu = page.getByRole('menu', { name: '文本操作' });
    await expect(menu).toBeVisible();
    for (const name of ['复制', '剪切', '粘贴', '删除', '全选', '撤销', '重做']) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: `../../.codex-tmp/file-selection-${mode}.png` });
    await menu.getByRole('menuitem', { name: '引用到聊天' }).click();
    const path = mode === 'local' ? `${browserRoot}/notes.txt` : 'D:/remote/notes.txt';
    await expect(page.getByTestId('quote')).toHaveText(`${path}:2:3-3:5\n\`\`\`\nchosen 中文\nlast\n\`\`\``);
    await expect(page.getByRole('textbox', { name: '聊天输入框' })).toHaveValue('原有草稿');
    await expect(page.getByRole('textbox', { name: '聊天输入框' })).toBeFocused();
    await expect(page.getByRole('dialog', { name: '文件浏览' })).toBeHidden();
    await page.getByRole('button', { name: '文件浏览', exact: true }).click();
    await expect(editor).toContainText('chosen 中文');
    await expect(page.getByRole('tab', { name: 'notes.txt' }).locator('.pf-dirty-dot')).toBeVisible();
  });
}

test('selection menu retains clipboard editing, undo and the default menu without a selection', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const editor = await openEditor(page, 'local');
  await selectPassage(editor);
  await rightClickSelection(page);
  await page.getByRole('menuitem', { name: '复制', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('chosen 中文\nlast');
  await rightClickSelection(page);
  await page.getByRole('menuitem', { name: '剪切', exact: true }).click();
  await expect(editor).not.toContainText('chosen');
  await editor.press('Control+z');
  await expect(editor).toContainText('chosen');
  await selectPassage(editor);
  await page.evaluate(() => navigator.clipboard.writeText('replacement'));
  await rightClickSelection(page);
  await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  await expect(editor).toContainText('replacement value');
  await editor.press('Control+Home');
  const prevented = await editor.evaluate(element => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.getByRole('menu', { name: '文本操作' })).toBeHidden();
});

test('mobile: long press offers quoting alongside the system selection menu', async ({ page }) => {
  const editor = await openEditor(page, 'mobile');
  await editor.fill('selected passage');
  await editor.press('Control+a');
  await longPress(page, editor.locator('.cm-line'), '文本操作');
  const menu = page.getByRole('menu', { name: '文本操作' });
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 390, height: 430 });
  await expect(menu).toBeVisible();
  const prevented = await editor.evaluate(element => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await page.screenshot({ path: '../../.codex-tmp/file-selection-mobile.png' });
  await menu.getByRole('menuitem', { name: '引用到聊天' }).click();
  await expect(page.getByTestId('quote')).toContainText(`${browserRoot}/notes.txt:1:`);
  await expect(page.getByRole('textbox', { name: '聊天输入框' })).toBeFocused();
});
