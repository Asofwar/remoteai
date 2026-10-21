import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    sharedDownloads: { name: string; type: string; content: string; active: boolean }[];
    shareResult: 'success' | 'cancel' | 'error';
  }
}

const card = (page: Page) => page.getByRole('article', { name: 'sample.md', exact: true });
async function enqueue(page: Page) {
  await page.getByRole('button', { name: '当前项目', exact: true }).click();
  await page.getByRole('button', { name: '下载：sample.md', exact: true }).click();
  await page.getByRole('button', { name: '下载列表', exact: true }).click();
  await expect(card(page)).toContainText('文件已就绪');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sharedDownloads = [];
    window.shareResult = 'success';
    const activation = navigator.userActivation;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }: ShareData) => {
      if (window.shareResult === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      if (window.shareResult === 'error') throw new DOMException('Failed', 'NotAllowedError');
      const file = files![0];
      const active = activation.isActive;
      window.sharedDownloads.push({ name: file.name, type: file.type, content: await file.text(), active });
    } });
  });
  await page.goto('e2e/downloads-harness.html');
  await page.evaluate(() => Object.assign(window.downloadFixture,
    { size: 18, delay: 0, textContent: 'Share offline file', mimeType: 'text/plain' }));
});

test('shares verified local bytes offline and keeps the compact layout', async ({ page }, info) => {
  await enqueue(page);
  await page.getByRole('button', { name: '断开电脑', exact: true }).click();
  await card(page).getByRole('button', { name: '分享', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.sharedDownloads)).toEqual([
    { name: 'sample.md', type: 'text/plain', content: 'Share offline file', active: true },
  ]);
  await expect(card(page)).toContainText('文件已就绪');
  expect(await page.evaluate(() => window.downloadFixture.opens)).toBe(1);
  await expect(page.getByText(/下载中断后会自动重试|离开此页面后|切换页面后下载会继续/)).toHaveCount(0);
  const source = await page.getByRole('button', { name: '当前项目', exact: true }).boundingBox();
  expect(source!.height).toBeLessThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('download-sharing.png') });
});

test('a fresh confirmation click restores activation after slow file preparation', async ({ page }) => {
  await enqueue(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'userActivation',
    { configurable: true, value: { isActive: false } }));
  await card(page).getByRole('button', { name: '分享', exact: true }).click();
  await expect(page.getByText('分享文件', { exact: true })).toBeVisible();
  await page.locator('.adm-dialog').getByRole('button', { name: '分享', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.sharedDownloads[0]?.active)).toBe(true);
});

test('cancelling the share sheet leaves the file ready without an error', async ({ page }) => {
  await enqueue(page);
  await page.evaluate(() => { window.shareResult = 'cancel'; });
  await card(page).getByRole('button', { name: '分享', exact: true }).click();
  await expect(card(page).getByRole('button', { name: '分享', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(card(page)).toContainText('文件已就绪');
});

test('unsupported file sharing keeps saving available and failures show a useful message', async ({ page }) => {
  await enqueue(page);
  await page.evaluate(() => { window.shareResult = 'error'; });
  await card(page).getByRole('button', { name: '分享', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('分享未完成');
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false }));
  await page.getByRole('button', { name: '切换页面', exact: true }).click();
  await page.getByRole('button', { name: '切换页面', exact: true }).click();
  await expect(card(page).getByRole('button', { name: '分享', exact: true })).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: '保存到设备', exact: true })).toBeEnabled();
});

test('missing cached data is never shared', async ({ page }) => {
  await enqueue(page);
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
  await card(page).getByRole('button', { name: '分享', exact: true }).click();
  await expect(card(page)).toContainText('下载失败');
  expect(await page.evaluate(() => window.sharedDownloads)).toEqual([]);
});
