import { expect, test } from '@playwright/test';
import type { desktopTest } from './remote-desktop-fixture';

declare global { interface Window { desktopTest: typeof desktopTest } }

test.beforeEach(async ({ page }) => {
  await page.goto('e2e/remote-desktop-harness.html');
  await page.getByRole('button', { name: '打开工具' }).click();
  await page.getByRole('button', { name: '远程桌面', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await page.locator('.rd-key-capture').focus();
});

test('copying one browser file downloads directly without a clipboard panel', async ({ page }) => {
  await page.evaluate(() => { window.desktopTest.clipboard.content = {
    format: 'files', files: [{ name: 'report.txt', data: 'cmVtb3Rl' }],
  }; });
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Control+c');
  expect((await downloading).suggestedFilename()).toBe('report.txt');
  await expect(page.getByRole('complementary', { name: '剪贴板' })).toHaveCount(0);
  await expect(page.locator('.rd-clipboard-notice')).toHaveCount(0);
  await expect(page.locator('.rd-key-capture')).toBeFocused();
});

test('multiple browser files offer a compact download action without interrupting input', async ({ page }) => {
  await page.evaluate(() => { window.desktopTest.clipboard.content = {
    format: 'files', files: [{ name: 'one.txt', data: 'YQ==' }, { name: 'two.txt', data: 'Yg==' }],
  }; });
  await page.keyboard.press('Control+c');
  const notice = page.locator('.rd-clipboard-notice');
  await expect(notice).toContainText('文件已收到');
  expect((await notice.boundingBox())!.width).toBeLessThanOrEqual(400);
  await expect(page.getByRole('complementary', { name: '剪贴板' })).toHaveCount(0);
  await expect(page.locator('.rd-key-capture')).toBeFocused();
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.desktopTest.inputs
    .some(input => input.kind === 'keyboard' && input.code === 'KeyA'))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('clipboard-notice.png') });
  await page.getByRole('button', { name: '下载文件', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载 one.txt' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 two.txt' })).toBeVisible();
});

test('empty paste shows a compact error and leaves the desktop available', async ({ page }) => {
  await page.locator('.rd-key-capture').evaluate(element => element.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
  })));
  const notice = page.locator('.rd-clipboard-notice');
  await expect(notice).toContainText('剪贴板中没有可发送的内容');
  expect((await notice.boundingBox())!.width).toBeLessThanOrEqual(400);
  await expect(page.getByRole('complementary', { name: '剪贴板' })).toHaveCount(0);
  await expect(page.locator('.rd-key-capture')).toBeFocused();
  expect(await page.evaluate(() => window.desktopTest.clipboard.pastes)).toBe(0);
});
