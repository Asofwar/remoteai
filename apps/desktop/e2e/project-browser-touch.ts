import { expect, type Page, type Locator } from '@playwright/test';

export async function longPress(page: Page, target: Locator, menu = '文件操作') {
  const bounds = (await target.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: bounds.x + Math.min(55, bounds.width / 2), y: bounds.y + bounds.height / 2 }] });
  await expect(page.getByRole('menu', { name: menu })).toBeVisible();
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
