import { expect, test } from '@playwright/test';
import { connect, fixtureUrl, login } from './chat-helpers';

test.beforeEach(async ({ page, request }) => {
  await request.post(`${fixtureUrl}/test/reset`);
  await request.post(`${fixtureUrl}/test/skills`, { data: { extra: 30 } });
  await login(page);
  await connect(page);
  await expect(page.getByRole('status').filter({ hasText: 'P2P' })).toBeVisible({ timeout: 16_000 });
  await page.getByRole('textbox', { name: '聊天消息' }).fill('/');
  await expect(page.getByRole('menuitem', { name: '使用技能 skill-29', exact: true })).toBeAttached();
});

for (const target of ['.chat-menu-options', '.chat-command-menu header']) {
  test(`scrolls skills both ways with the wheel over ${target} and chooses a later skill`, async ({ page }) => {
    const popover = page.locator('.chat-composer-popover');
    const position = () => popover.evaluate(node => node.scrollTop);
    const input = page.getByRole('textbox', { name: '聊天消息' });
    await page.locator(target).hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(position).toBeGreaterThan(0);
    await expect(input).toHaveValue('/');
    await page.mouse.wheel(0, -10000);
    await expect.poll(position).toBe(0);
    await page.mouse.wheel(0, 10000);
    await expect(page.getByRole('button', { name: '关闭命令和技能' })).toBeInViewport();
    const last = page.getByRole('menuitem', { name: '使用技能 skill-9', exact: true });
    await expect(last).toBeInViewport();
    await last.click();
    await expect(input).toHaveValue('$skill-9 ');
    await expect(popover).toHaveCount(0);
    await expect(input).toBeFocused();
  });
}

test('keeps touch scrolling and skill selection working in a phone browser', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch gestures are covered by the mobile project.');
  const popover = page.locator('.chat-composer-popover');
  const box = (await popover.boundingBox())!;
  const x = box.x + box.width / 2;
  const start = box.y + box.height - 24;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
    for (let step = 1; step <= 8; step++) {
      const y = start - (box.height - 80) * step / 8;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  await expect.poll(() => popover.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await expect(input).toHaveValue('/');
  await page.getByRole('menuitem', { name: '使用技能 skill-9', exact: true }).tap();
  await expect(input).toHaveValue('$skill-9 ');
  await expect(popover).toHaveCount(0);
});
