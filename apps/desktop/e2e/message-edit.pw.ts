import { test, expect } from '@playwright/test';

for (const remote of [false, true]) {
  for (const dark of [false, true]) {
    const name = `${remote ? 'remote' : 'local'}-${dark ? 'dark' : 'light'}`;
    test(`${name}: edit, cancel and delete the latest message`, async ({ page }) => {
      await page.setViewportSize({ width: 1100, height: 780 });
      await page.goto(`/e2e/message-edit-harness.html?${remote ? 'remote&' : ''}${dark ? 'dark' : ''}`);
      await expect(page.getByRole('button', { name: '编辑消息', exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '引用消息', exact: true })).toHaveCount(0);
      await page.getByText('请修改最后这条消息。', { exact: true }).hover();
      await page.getByRole('button', { name: '编辑消息', exact: true }).click();
      await page.getByRole('textbox').fill('修改后的最后一条消息。');
      await page.getByRole('button', { name: '发送', exact: true }).click();
      await expect(page.getByText('修改后的最后一条消息。', { exact: true })).toBeVisible();
      await page.getByText('修改后的最后一条消息。', { exact: true }).hover();
      await page.getByRole('button', { name: '编辑消息', exact: true }).click();
      await page.getByRole('button', { name: '删除消息', exact: true }).click();
      const confirm = page.locator('.ant-popconfirm');
      await expect(confirm).toContainText('这条消息及之后的所有消息都会删除，无法撤销。');
      expect((await confirm.boundingBox())!.width).toBeLessThanOrEqual(400);
      await confirm.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.getByRole('textbox')).toHaveText('修改后的最后一条消息。');
      await page.screenshot({ path: `../../.codex-tmp/message-edit-${name}.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '删除消息', exact: true }).click();
      await confirm.getByRole('button', { name: '删除', exact: true }).click();
      await expect(page.getByText('修改后的最后一条消息。', { exact: true })).toHaveCount(0);
      await expect(page.getByText('请保留这条消息。', { exact: true })).toBeVisible();
      await expect(page.getByText('之前的回复也会保留。', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '编辑消息', exact: true })).toHaveCount(1);
    });
  }
}
