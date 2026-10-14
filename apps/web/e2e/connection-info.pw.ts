import { expect, test, type Locator } from '@playwright/test';

async function expectUnclippedAction(action: Locator) {
  await expect(action).toBeVisible();
  await expect(action).toBeInViewport();
  expect(await action.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const header = element.closest('.chat-header')!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    return bounds.left >= header.left && bounds.right <= header.right
      && text.left >= bounds.left && text.right <= bounds.right + 1
      && text.top >= bounds.top && text.bottom <= bounds.bottom + 1
      && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
}

test('keeps identity verification and reconnect usable with a long computer name', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('e2e/connection-info-harness.html?changed=1');
  const verify = page.getByRole('button', { name: '核对电脑身份', exact: true });
  const reconnect = page.getByRole('button', { name: '立即连接', exact: true });
  await expectUnclippedAction(verify);
  await expectUnclippedAction(reconnect);
  expect(await page.locator('.chat-connection-name').evaluate(element =>
    element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.locator('.chat-header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('connection-actions.png') });
  await verify.click();
  await page.getByRole('textbox', { name: '设备指纹' }).fill('reviewed-device-fingerprint');
  await page.getByRole('button', { name: '核对并重新连接' }).click();
  await expect(page.getByTestId('result')).toHaveText('verified:reviewed-device-fingerprint');
  await expect(page.getByRole('textbox', { name: '设备指纹' })).toBeHidden();
});

test('keeps the retry countdown visible and supports keyboard reconnection', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('e2e/connection-info-harness.html');
  const reconnect = page.getByRole('button', { name: '立即连接', exact: true });
  await expectUnclippedAction(reconnect);
  await expect(reconnect).toContainText('秒');
  await reconnect.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('result')).toHaveText('reconnected');
});
