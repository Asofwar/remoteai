import { expect, test } from '@playwright/test';
import type { desktopTest } from './remote-desktop-fixture';

declare global { interface Window { desktopTest: typeof desktopTest } }

test('retains only visited displays at 1 FPS and resumes their original connections', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('e2e/remote-desktop-harness.html?displays&three-displays');
  await page.getByRole('button', { name: '打开工具' }).click();
  await page.getByRole('button', { name: '远程桌面', exact: true }).click();
  const video = page.locator('video');
  await expect.poll(() => video.evaluate(element => element.videoWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.desktopTest.selectedDisplays)).toEqual(['display-1']);
  await page.getByRole('button', { name: '显示', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '显示设置' });
  const first = panel.getByRole('button', { name: '显示器 1 · 主屏 · 1600 × 900', exact: true });
  const second = panel.getByRole('button', { name: '显示器 2 · 900 × 1600', exact: true });
  await second.click();
  await expect(second).toBeEnabled();
  await expect.poll(() => video.evaluate(element => element.videoHeight > element.videoWidth)).toBe(true);
  expect(await page.evaluate(() => window.desktopTest.selectedDisplays)).toEqual(['display-1', 'display-2']);
  expect(await page.evaluate(() => window.desktopTest.closed)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.desktopTest.settingsRequests
    .some(request => request.settings.displayId === 'display-1' && request.settings.fps === 1))).toBe(true);
  const before = await page.evaluate(() => ({ ...window.desktopTest.framesByDisplay }));
  await expect.poll(() => page.evaluate(() => window.desktopTest.framesByDisplay['display-1']))
    .toBeGreaterThan(before['display-1'] + 1);
  const after = await page.evaluate(() => ({ ...window.desktopTest.framesByDisplay }));
  expect(after['display-2'] - before['display-2']).toBeGreaterThan(10);
  expect(after['display-1'] - before['display-1']).toBeLessThanOrEqual(4);
  expect(after['display-3']).toBeUndefined();
  await first.click();
  await expect(first).toBeEnabled();
  await expect.poll(() => video.evaluate(element => element.videoWidth > element.videoHeight)).toBe(true);
  expect(await page.evaluate(() => window.desktopTest.captures)).toBe(2);
  expect(await page.evaluate(() => window.desktopTest.closed)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.desktopTest.settingsRequests.at(-1)?.settings))
    .toMatchObject({ displayId: 'display-1', fps: 'auto' });
  await page.screenshot({ path: info.outputPath('retained-displays.png') });
  await page.getByRole('button', { name: '关闭显示设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.desktopTest.closed)).toBe(2);
  expect(errors).toEqual([]);
});
