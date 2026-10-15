import { expect, test, type Page } from '@playwright/test';

const card = (page: Page) => page.getByRole('article', { name: 'sample.md', exact: true });
async function enqueue(page: Page) {
  await page.getByRole('button', { name: '当前项目', exact: true }).click();
  await page.getByRole('button', { name: '下载：sample.md', exact: true }).click();
  await page.getByRole('button', { name: '下载列表', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('e2e/downloads-harness.html');
  await page.evaluate(() => { window.downloadFixture.size = 512; window.downloadFixture.delay = 0; });
});

test('automatically retries exactly five times and a manual resume starts a fresh run', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => { window.downloadFixture.openFailures = 6; });
  await enqueue(page);
  for (const [index, delay] of [1000, 2000, 4000, 8000, 16000].entries()) {
    await expect(card(page)).toContainText('正在重试');
    await page.clock.runFor(delay);
    await expect.poll(() => page.evaluate(() => window.downloadFixture.opens)).toBe(index + 2);
  }
  await expect(card(page)).toContainText('下载失败');
  await page.clock.runFor(60_000);
  expect(await page.evaluate(() => window.downloadFixture.opens)).toBe(6);
  await card(page).getByRole('button', { name: '继续下载' }).click();
  await page.clock.runFor(1000);
  await expect(card(page)).toContainText('文件已就绪');
  expect(await page.evaluate(() => window.downloadFixture.opens)).toBe(7);
});

test('opens verified cached text offline without executing HTML and keeps Save available', async ({ page }, info) => {
  const content = '<script>document.body.textContent="unsafe"</script>\nDownloaded document';
  await page.evaluate(content => Object.assign(window.downloadFixture,
    { textContent: content, size: content.length, mimeType: 'text/html' }), content);
  await enqueue(page);
  await expect(card(page)).toContainText('文件已就绪');
  await page.getByRole('button', { name: '断开电脑', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await card(page).getByRole('button', { name: '打开', exact: true }).click();
  const popup = await opened;
  await expect(popup.locator('body')).toContainText(content);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(card(page).getByRole('button', { name: '保存到设备' })).toBeEnabled();
  expect(await page.evaluate(() => window.downloadFixture.opens)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `../../.codex-tmp/download-actions-${info.project.name}.png` });
  await popup.close();
});

test('a blocked popup leaves the file ready and shows an actionable message', async ({ page }) => {
  await enqueue(page);
  await expect(card(page)).toContainText('文件已就绪');
  await page.evaluate(() => { window.open = () => null; });
  await card(page).getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('允许弹出窗口');
  await expect(card(page)).toContainText('文件已就绪');
});

test('missing cached bytes cannot be opened or marked as saved', async ({ page }) => {
  await enqueue(page);
  await expect(card(page)).toContainText('文件已就绪');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('codex-switch.web.downloads.v1', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').clear();
      tx.oncomplete = () => { request.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await card(page).getByRole('button', { name: '打开', exact: true }).click();
  await expect(card(page)).toContainText('下载失败');
  await expect(card(page).getByRole('button', { name: '打开', exact: true })).toHaveCount(0);
  await expect(card(page)).not.toContainText('已保存到设备');
});
