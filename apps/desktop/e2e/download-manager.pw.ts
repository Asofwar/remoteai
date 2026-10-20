import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type {} from './download-manager-harness';

test.setTimeout(60_000);

async function enqueue(page: Page) {
  await page.getByRole('button', { name: '打开安装包' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '下载', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '暂停下载', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
}

test('collapsed download icon counts active tasks and receives the download animation', async ({ page }) => {
  await page.goto('/e2e/download-manager-harness.html?collapsed&dark');
  await page.evaluate(() => { window.desktopDownloads.delay = 1500; });
  const icon = page.locator('[data-download-target]');
  const count = icon.getByRole('status');
  await expect(count).toHaveCount(0);
  await page.getByRole('button', { name: '文件操作：C:/project/office.msi', exact: true }).click();
  const download = page.getByRole('menuitem', { name: '下载到本机…', exact: true });
  await download.click({ trial: true });
  const origin = (await download.boundingBox())!;
  const destination = (await icon.boundingBox())!;
  await download.click();
  const flight = page.locator('.download-flight');
  await expect(flight).toBeVisible();
  const points = await flight.evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 260;
    return (animation.effect as KeyframeEffect).getKeyframes().map(frame => {
      const matrix = new DOMMatrixReadOnly(String(frame.transform));
      return { x: matrix.m41 + 16, y: matrix.m42 + 16 };
    });
  });
  expect(points[0].x).toBeCloseTo(origin.x + origin.width / 2, 0);
  expect(points[0].y).toBeCloseTo(origin.y + origin.height / 2, 0);
  expect(points.at(-1)!.x).toBeCloseTo(destination.x + destination.width / 2, 0);
  expect(points.at(-1)!.y).toBeCloseTo(destination.y + destination.height / 2, 0);
  await expect(count).toHaveText('1');
  await expect(count).toHaveCSS('color', 'rgb(255, 107, 107)');
  const badge = (await count.boundingBox())!;
  expect(badge.y).toBeLessThan(destination.y);
  expect(badge.x).toBeGreaterThan(destination.x);
  await page.screenshot({ path: '../../.codex-tmp/desktop-download-flight.png' });
  await flight.evaluate(element => element.getAnimations()[0].play());
  await expect(flight).toHaveCount(0);
  await page.getByRole('button', { name: '切换电脑', exact: true }).click();
  await enqueue(page);
  await expect(count).toHaveText('2');
  await page.getByRole('button', { name: '切换账号' }).click();
  await expect(count).toHaveCount(0);
  await page.getByRole('button', { name: '切换账号' }).click();
  await expect(count).toHaveText('2');
  await page.getByRole('navigation').getByRole('button', { name: '下载管理', exact: true }).click();
  const office = page.getByRole('article', { name: 'office.msi' });
  await office.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(count).toHaveText('1');
  await page.evaluate(() => { window.desktopDownloads.delay = 10; });
  await expect(page.getByRole('article', { name: 'home.msi' })).toContainText('文件已就绪', { timeout: 30_000 });
  await expect(count).toHaveCount(0);
});

test('failed additions do not animate and reduced motion still updates the download count', async ({ page }) => {
  await page.goto('/e2e/download-manager-harness.html');
  await page.evaluate(() => { window.desktopDownloads.failDownload = true; });
  const link = page.getByRole('button', { name: '文件操作：C:/project/office.msi', exact: true });
  await link.click();
  await page.getByRole('menuitem', { name: '下载到本机…', exact: true }).click();
  await expect(page.getByText('操作未完成，请稍后重试。')).toBeVisible();
  await expect(page.locator('.download-flight')).toHaveCount(0);
  await expect(page.locator('[data-download-target] sup')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.desktopDownloads.failDownload = false; });
  await link.click();
  await page.getByRole('menuitem', { name: '下载到本机…', exact: true }).click();
  await expect(page.locator('[data-download-target] sup')).toHaveText('1');
  await expect(page.locator('.download-flight')).toHaveCount(0);
});

test('desktop navigation exposes background downloads above diagnostics and saves complete files', async ({ page }) => {
  await page.goto('/e2e/download-manager-harness.html');
  const navigation = page.getByRole('navigation');
  const labels = await navigation.getByRole('button').allTextContents();
  expect(labels.indexOf('下载管理') + 1).toBe(labels.indexOf('日志诊断'));
  await enqueue(page);
  await page.getByRole('button', { name: '切换电脑', exact: true }).click();
  await enqueue(page);
  await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
  const office = page.getByRole('article', { name: 'office.msi' });
  const home = page.getByRole('article', { name: 'home.msi' });
  await expect(office).toContainText('办公电脑');
  await expect(home).toContainText('家里电脑');
  await expect.poll(() => office.getByRole('progressbar').getAttribute('value')).not.toBe('0');
  await office.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(office).toContainText('已暂停');
  await page.screenshot({ path: '../../.codex-tmp/desktop-download-manager.png' });
  await navigation.getByRole('button', { name: '日志诊断', exact: true }).click();
  await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
  await expect(home).toContainText('文件已就绪', { timeout: 30_000 });
  await office.getByRole('button', { name: '继续下载', exact: true }).click();
  await expect(office).toContainText('文件已就绪', { timeout: 30_000 });
  const saved = page.waitForEvent('download');
  await office.getByRole('button', { name: '保存到设备' }).click();
  expect(await readFile((await (await saved).path())!)).toEqual(Buffer.alloc(8 * 1024 * 1024, 'A'));
  await page.getByRole('button', { name: '切换账号' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: '切换账号' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
});

test('disconnecting one computer pauses only its download and allows removing the task', async ({ page }) => {
  await page.goto('/e2e/download-manager-harness.html');
  await page.evaluate(() => { window.desktopDownloads.delay = 1200; });
  await enqueue(page);
  await page.getByRole('button', { name: '切换电脑', exact: true }).click();
  await enqueue(page);
  await page.getByRole('navigation').getByRole('button', { name: '下载管理', exact: true }).click();
  await page.getByRole('button', { name: '断开办公电脑' }).click();
  const office = page.getByRole('article', { name: 'office.msi' });
  await expect(office).toContainText('已暂停');
  await expect(office.getByRole('button', { name: '继续下载' })).toBeDisabled();
  await expect(page.getByRole('article', { name: 'home.msi' })).toContainText('文件已就绪', { timeout: 20_000 });
  await office.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^删\s*除$/ }).click();
  await expect(office).toHaveCount(0);
});

test('PC relay downloads use raw binary IPC and stay responsive through pause, resume and navigation',
  async ({ page }) => {
    await page.goto('/e2e/download-manager-harness.html?nativeBulk');
    await enqueue(page);
    const navigation = page.getByRole('navigation');
    await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
    const office = page.getByRole('article', { name: 'office.msi' });
    await expect.poll(() => page.evaluate(() => window.desktopDownloads.nativeBulkStats.batches)).toBeGreaterThan(4);
    await office.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(office).toContainText('已暂停');
    const before = await page.evaluate(() => window.desktopDownloads.nativeBulkStats.polls);
    await office.getByRole('button', { name: '继续下载', exact: true }).click();
    await navigation.getByRole('button', { name: '日志诊断', exact: true }).click();
    await expect(page.locator('main')).toContainText('日志诊断');
    await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
    await expect(office).toContainText('文件已就绪');
    const stats = await page.evaluate(() => window.desktopDownloads.nativeBulkStats);
    expect(stats.polls).toBeGreaterThan(before);
    expect(stats.batches).toBe(stats.acknowledged);
    expect(await page.evaluate(() => window.desktopDownloads.offsets)).toEqual([]);
    const saved = page.waitForEvent('download');
    await office.getByRole('button', { name: '保存到设备' }).click();
    expect(await readFile((await (await saved).path())!)).toEqual(Buffer.alloc(8 * 1024 * 1024, 'A'));
  });

test('PC native P2P downloads receive 32 MiB through raw IPC and verify the saved file after pause and resume',
  async ({ page }) => {
    await page.goto('/e2e/download-manager-harness.html?nativeDirect');
    await enqueue(page);
    const navigation = page.getByRole('navigation');
    await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
    const office = page.getByRole('article', { name: 'office.msi' });
    await expect.poll(() => office.getByRole('progressbar').getAttribute('value')).not.toBe('0');
    await office.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(office).toContainText('已暂停');
    const before = await page.evaluate(() => window.desktopDownloads.nativeDirectStats.polls);
    await office.getByRole('button', { name: '继续下载', exact: true }).click();
    await navigation.getByRole('button', { name: '日志诊断', exact: true }).click();
    await expect(page.locator('main')).toContainText('日志诊断');
    await navigation.getByRole('button', { name: '下载管理', exact: true }).click();
    await expect(office).toContainText('文件已就绪', { timeout: 30_000 });
    const stats = await page.evaluate(() => window.desktopDownloads.nativeDirectStats);
    expect(stats.polls).toBeGreaterThan(before);
    expect(stats.batches).toBeGreaterThan(4);
    expect(stats.maxReads).toBe(1);
    expect(await page.evaluate(() => window.desktopDownloads.offsets)).toEqual([]);
    const saved = page.waitForEvent('download');
    await office.getByRole('button', { name: '保存到设备' }).click();
    expect(await readFile((await (await saved).path())!)).toEqual(Buffer.alloc(32 * 1024 * 1024, 'A'));
  });
