import { expect, test } from '@playwright/test';

test('keeps chat usable after service takeover and recovers from incomplete accounts', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let response: unknown = { accounts: [], providers: [], selection: null };
  await page.route('**/accounts-fixture.json', route => route.fulfill({ json: response }));
  await page.goto('/web/e2e/chat-accounts-harness.html');
  await page.getByRole('button', { name: '打开聊天列表' }).click();
  await expect(page.getByRole('button', { name: '保留的聊天' })).toBeVisible();
  await page.getByRole('button', { name: '账户与电脑' }).click();
  await page.getByRole('button', { name: '切换账户' }).click();
  await expect(page.getByText('电脑上的聊天暂不可用，请在电脑上重新打开 Remote AI。')).toBeVisible();
  await expect(page.getByText('暂无可选账户，请先在电脑上添加账户。')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('unavailable-accounts.png'), animations: 'disabled' });
  response = { running: true };
  await page.reload();
  await page.getByRole('button', { name: '打开聊天列表' }).click();
  await page.getByRole('button', { name: '账户与电脑' }).click();
  await page.getByRole('button', { name: '切换账户' }).click();
  await expect(page.getByRole('alert')).toHaveText('暂时无法读取电脑的账户，请重试。');
  const bounds = await page.getByRole('alert').boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(400);
  response = { running: true, selection: { kind: 'account', id: 'restored' }, choices: [
    { kind: 'account', id: 'restored', name: '恢复的账户', detail: '可继续聊天', available: true },
  ] };
  await page.getByRole('button', { name: '重试读取账户' }).click();
  await expect(page.getByRole('button', { name: '恢复的账户', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
