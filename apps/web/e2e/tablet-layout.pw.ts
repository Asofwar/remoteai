import { expect, test, type Page } from '@playwright/test';
import { connect, fixtureUrl, login, screenshot } from './chat-helpers';

async function expectFullWindow(page: Page) {
  const viewport = page.viewportSize()!;
  await expect.poll(async () => page.locator('.app-shell').boundingBox()).toEqual({
    x: 0, y: 0, width: viewport.width, height: viewport.height,
  });
  await expect(page.getByRole('textbox', { name: '聊天消息' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('fills the tablet window and preserves the draft across rotation', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Requires touch input');
  await page.setViewportSize({ width: 800, height: 1280 });
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page);
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await connect(page);
  const draft = page.getByRole('textbox', { name: '聊天消息' });
  await draft.fill('平板横竖屏切换后继续编辑');
  await expectFullWindow(page);
  await screenshot(page, info, 'tablet-portrait');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectFullWindow(page);
  await expect(draft).toHaveValue('平板横竖屏切换后继续编辑');
  await expect(page.locator('.desktop-sidebar')).toBeVisible();
  await screenshot(page, info, 'tablet-landscape');
  await page.setViewportSize({ width: 800, height: 1280 });
  await expectFullWindow(page);
  await expect(draft).toHaveValue('平板横竖屏切换后继续编辑');
  await expect(page.locator('.mobile-tabbar')).toBeVisible();
});
