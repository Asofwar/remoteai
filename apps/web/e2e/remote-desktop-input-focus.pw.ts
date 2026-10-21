import { expect, test, type Page } from '@playwright/test';
import type { DesktopInputFocus } from '../../../shared/remote-desktop/protocol';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`e2e/remote-desktop-harness.html?touch&${query}`);
  await page.getByRole('button', { name: '打开工具' }).click();
  await page.getByRole('button', { name: '远程桌面', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
}

async function focus(page: Page, value: DesktopInputFocus | null) {
  await page.evaluate(value => { window.desktopTest.inputFocus = value; }, value);
}

async function bottomSpace(page: Page, row: number) {
  const video = (await page.locator('video').boundingBox())!;
  const stage = (await page.locator('.rd-stage').boundingBox())!;
  return stage.y + stage.height - (video.y + video.height * row);
}

test('follows the detected caret and its line height, then falls back when detection is unavailable',
  async ({ page }, info) => {
    await open(page);
    const original = (await page.locator('video').boundingBox())!;
    await focus(page, { top: 0.78, bottom: 0.8, lineHeight: 0.02 });
    await page.getByRole('button', { name: '键盘', exact: true }).click();
    await page.setViewportSize({ width: 844, height: 220 });
    await expect.poll(() => bottomSpace(page, 0.8)).toBeCloseTo(original.height * 0.04, 0);
    await focus(page, { top: 0.88, bottom: 0.92, lineHeight: 0.04 });
    await expect.poll(() => bottomSpace(page, 0.92)).toBeCloseTo(original.height * 0.08, 0);
    const field = page.getByRole('textbox', { name: '发送到电脑的文字' });
    await field.fill('follow caret');
    await expect.poll(() => page.evaluate(() => window.desktopTest.inputs.at(-1)))
      .toEqual({ kind: 'text', text: 'follow caret' });
    await page.screenshot({ path: info.outputPath('detected-input-row.png') });
    await focus(page, null);
    await expect.poll(async () => {
      const stage = (await page.locator('.rd-stage').boundingBox())!;
      const cursor = (await page.locator('.rd-cursor').boundingBox())!;
      return stage.y + stage.height - cursor.y;
    }).toBeCloseTo(48, 0);
    await page.getByRole('button', { name: '收起键盘' }).click();
    const reads = await page.evaluate(() => window.desktopTest.inputFocusReads);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.desktopTest.inputFocusReads)).toBe(reads);
  });

test('reveals the focused input rectangle and keeps the existing horizontal position', async ({ page }) => {
  await open(page);
  await page.mouse.move(200, 120);
  await page.mouse.down();
  await page.mouse.move(820, 120);
  await page.mouse.up();
  const x = (await page.locator('video').boundingBox())!.x;
  await focus(page, { top: 0.65, bottom: 0.72 });
  await page.getByRole('button', { name: '键盘', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 220 });
  await expect.poll(() => bottomSpace(page, 0.72)).toBeCloseTo(48, 0);
  expect((await page.locator('video').boundingBox())!.x).toBeCloseTo(x);
});

test('does not query old hosts that do not advertise input detection', async ({ page }) => {
  await open(page, 'legacy');
  await page.getByRole('button', { name: '键盘', exact: true }).click();
  await page.getByRole('textbox', { name: '发送到电脑的文字' }).fill('legacy input');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.desktopTest.inputFocusReads)).toBe(0);
});
