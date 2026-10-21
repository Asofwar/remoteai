import { expect, type Page, type Locator } from '@playwright/test';

export async function longPress(page: Page, target: Locator) {
  const bounds = (await target.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: bounds.x + 55, y: bounds.y + bounds.height / 2 }] });
  await expect(page.getByRole('menu', { name: '文件操作' })).toBeVisible();
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
