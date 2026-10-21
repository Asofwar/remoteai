import { expect, test, type Page } from '@playwright/test';
import { longPress } from './project-browser-touch';

async function openBrowser(page: Page, mode: string) {
  if (mode === 'phone') await page.getByRole('button', { name: '打开工具', exact: true }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'src', exact: true })).toBeVisible();
}

for (const mode of ['local', 'remote', 'web', 'phone']) {
  test(`${mode}: reference files and folders into the existing composer and send their paths`, async ({ page }) => {
    const phone = mode === 'phone';
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto(`/e2e/project-reference-harness.html?mode=${mode}`);
    const input = page.getByRole('textbox', { name: mode === 'local' ? '消息' : '聊天消息', exact: true });
    await input.fill('保留草稿');
    for (const name of ['notes.txt', 'src', 'notes.txt']) {
      await openBrowser(page, mode);
      const row = page.getByRole('treeitem', { name, exact: true });
      if (phone) await longPress(page, row); else await row.click({ button: 'right' });
      const menu = page.getByRole('menu', { name: '文件操作', exact: true });
      expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(400);
      if (name === 'src') await page.screenshot({ path: `../../.codex-tmp/project-reference-${mode}-menu.png` });
      await page.getByRole('menuitem', { name: '引用文件', exact: true }).click();
      await expect(menu).toBeHidden();
      await expect(page.getByRole('dialog', { name: '文件浏览', exact: true })).toBeHidden();
      if (mode === 'local') await expect(input).toHaveText('保留草稿');
      else await expect(input).toHaveValue('保留草稿');
      await expect(input).toBeFocused();
      await expect(page.locator('body')).not.toHaveAttribute('data-sent');
    }
    await page.screenshot({ path: `../../.codex-tmp/project-reference-${mode}-composer.png` });
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    const sent = JSON.parse((await page.locator('body').getAttribute('data-sent'))!);
    expect(sent.text).toBe('保留草稿');
    const cwd = mode === 'local' ? 'C:/project' : 'D:/remote';
    expect(sent.attachments).toHaveLength(2);
    expect(sent.attachments).toEqual(expect.arrayContaining([
      { kind: 'file', name: 'notes.txt', path: `${cwd}/notes.txt` },
      { kind: 'folder', name: 'src', path: `${cwd}/src` },
    ]));
  });
}
