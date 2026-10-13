import { expect, test, type Page } from '@playwright/test';
import type { desktopTest } from './remote-desktop-fixture';

declare global { interface Window { desktopTest: typeof desktopTest } }

async function open(page: Page, query = '') {
  await page.goto(`e2e/remote-desktop-harness.html?native-clipboard${query}`);
  await page.getByRole('button', { name: '打开远程桌面', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await page.locator('.rd-key-capture').focus();
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'Native viewer clipboard and physical keyboard regression coverage.');
  await open(page);
});

test('a remote context-menu copy wins over stale local data and remains available for repeated paste', async ({ page }) => {
  await page.evaluate(() => {
    window.desktopTest.clipboard.content = { format: 'text', text: 'remote menu' };
    window.desktopTest.clipboard.revision += 1;
  });
  for (let count = 1; count <= 2; count++) {
    await page.keyboard.press('Control+v');
    await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(count);
  }
  expect(await page.evaluate(() => window.desktopTest.clipboard.content)).toEqual({ format: 'text', text: 'remote menu' });
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(0);
});

test('a finished copy with denied local writes still pastes the original remote clipboard', async ({ page }) => {
  await page.evaluate(() => { window.desktopTest.localClipboard.writeFailures = 3; });
  await page.keyboard.press('Control+c');
  await expect(page.getByRole('button', { name: '复制到本机' })).toBeVisible();
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(0);
  expect(await page.evaluate(() => window.desktopTest.clipboard.content))
    .toEqual({ format: 'text', text: 'Remote clipboard 测试' });
});

test('remote cut files keep their native entries instead of being uploaded as temporary copies', async ({ page }) => {
  await page.evaluate(() => { window.desktopTest.clipboard.content = {
    format: 'files', files: [{ name: 'original.docx', data: 'YQ==' }],
  }; });
  await page.keyboard.press('Control+x');
  await expect.poll(() => page.evaluate(() => window.desktopTest.localClipboard.content.format)).toBe('files');
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(0);
  expect(await page.evaluate(() => window.desktopTest.clipboard.copies)).toBe(1);
});

test('disabled sharing and unsupported content preserve native copy and paste', async ({ page }) => {
  await open(page, '&clipboard-disabled');
  await page.keyboard.press('Control+x'); await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.copies)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(0);
  await expect(page.locator('.rd-clipboard-notice')).toHaveCount(0);
  await open(page);
  await page.evaluate(() => { window.desktopTest.clipboard.shareable = false; });
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(0);
});

test('new local copies still transfer, while remote changes during upload win at commit', async ({ page }) => {
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => window.desktopTest.localClipboard.content))
    .toEqual({ format: 'text', text: 'Remote clipboard 测试' });
  await page.evaluate(() => { window.desktopTest.localClipboard.content = { format: 'text', text: 'new local' }; });
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(1);
  await page.evaluate(() => {
    window.desktopTest.localClipboard.content = { format: 'text', text: 'later local' };
    window.desktopTest.clipboard.changeDuringUpload = { format: 'text', text: 'newest remote' };
  });
  await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.clipboard.nativePastes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.writes)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.content)).toEqual({ format: 'text', text: 'newest remote' });
});

test('old clipboard hosts receive native shortcuts instead of unsafe automatic uploads', async ({ page }) => {
  await open(page, '&clipboard-legacy');
  await page.keyboard.press('Control+x'); await page.keyboard.press('Control+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.inputs
    .filter(input => input.kind === 'keyboard' && input.code === 'KeyV' && input.down).length)).toBe(1);
  expect(await page.evaluate(() => window.desktopTest.clipboard.requests)).toEqual([]);
});

test('application paste shortcuts with extra modifiers are forwarded intact', async ({ page }) => {
  await page.keyboard.press('Control+Shift+v'); await page.keyboard.press('Control+Alt+v');
  await expect.poll(() => page.evaluate(() => window.desktopTest.inputs
    .filter(input => input.kind === 'keyboard' && input.code === 'KeyV' && input.down).length)).toBe(2);
  expect(await page.evaluate(() => window.desktopTest.clipboard.requests)).toEqual([]);
});
