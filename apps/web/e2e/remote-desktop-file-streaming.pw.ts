import { expect, test } from '@playwright/test';
import type { desktopTest } from './remote-desktop-fixture';

declare global { interface Window { desktopTest: typeof desktopTest } }

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'Native file clipboard belongs to desktop viewers.');
  await page.goto('e2e/remote-desktop-harness.html?native-clipboard&file-streaming');
  await page.getByRole('button', { name: '打开远程桌面', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await page.locator('.rd-touch').click();
});

test('local paste serves file bytes on demand over the active WebRTC clipboard channel', async ({ page }) => {
  const data = Buffer.from('local → remote '.repeat(10000)).toString('base64');
  await page.evaluate(data => { window.desktopTest.localClipboard.content = {
    format: 'files', files: [{ name: 'local.txt', data }],
  }; }, data);
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.fileStreams.hostBytes)).toEqual([data]);
  expect(await page.evaluate(() => window.desktopTest.fileStreams.errors)).toEqual([]);
  expect(await page.evaluate(() => window.desktopTest.clipboard.requests.some(r => r.request.action === 'begin')))
    .toBe(false);
  await expect(page.locator('.rd-key-capture')).toBeFocused();
});

test('remote copy transfers only metadata until Explorer pastes, including while minimized', async ({ page }) => {
  const data = Buffer.from('remote → local '.repeat(10000)).toString('base64');
  await page.evaluate(data => { window.desktopTest.clipboard.content = {
    format: 'files', files: [{ name: 'remote.txt', data }],
  }; }, data);
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => window.desktopTest.localClipboard.content.format)).toBe('fileOffer');
  expect(await page.evaluate(() => window.desktopTest.fileStreams.reads)).toEqual([]);
  await page.getByRole('button', { name: '最小化', exact: true }).click();
  await page.evaluate(() => window.desktopTest.fileStreams.pasteLocal());
  expect(await page.evaluate(() => window.desktopTest.fileStreams.localBytes)).toEqual([data]);
  expect(await page.evaluate(() => window.desktopTest.fileStreams.errors)).toEqual([]);
});
