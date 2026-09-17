import { expect, test, type Page } from '@playwright/test';
import { connect, fixtureUrl, login, screenshot, send, settled } from './chat-helpers';

type Point = { x: number; y: number };
async function swipe(page: Page, points: Point[], cancel = false) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const point of points.slice(1)) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    }
    await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

const drawer = (page: Page) => page.locator('.chat-drawer .ant-drawer-content');
const right = [{ x: 90, y: 300 }, { x: 115, y: 302 }, { x: 170, y: 306 }, { x: 240, y: 310 }];

test.beforeEach(async ({ page, request }) => {
  await request.post(`${fixtureUrl}/test/reset`);
  await login(page);
  await connect(page);
  await expect(page.getByRole('status').filter({ hasText: 'P2P' })).toBeVisible({ timeout: 16_000 });
});

test('swipes right across the conversation to open and left across a row or mask to close',
  async ({ page, isMobile }, info) => {
    test.skip(!isMobile, 'Touch gestures are exercised by the mobile browser project.');
    await page.getByRole('textbox', { name: '聊天消息' }).fill('保留草稿');
    await swipe(page, right);
    await expect(drawer(page)).toBeVisible();
    await screenshot(page, info, 'swipe-open-drawer');
    const row = page.getByRole('button', { name: '移动端聊天体验', exact: true });
    const bounds = await row.boundingBox();
    if (!bounds) throw new Error('Missing conversation row');
    const y = bounds.y + bounds.height / 2;
    await swipe(page, [{ x: 280, y }, { x: 250, y }, { x: 190, y }, { x: 100, y }]);
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '新聊天', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '聊天消息' })).toHaveValue('保留草稿');
    await swipe(page, right);
    await expect(drawer(page)).toBeVisible();
    await swipe(page, [{ x: 380, y: 300 }, { x: 350, y: 300 }, { x: 290, y: 300 }]);
    await expect(drawer(page)).toHaveCount(0);
  });

test('ignores short, opposite, vertical-first, cancelled, selected-text and multitouch gestures',
  async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch gestures are exercised by the mobile browser project.');
    for (const path of [right.slice(0, 2), [...right].reverse(),
      [{ x: 90, y: 300 }, { x: 92, y: 330 }, { x: 240, y: 340 }]]) {
      await swipe(page, path);
      await expect(page).toHaveURL(/\/web\//);
      await expect(drawer(page)).toHaveCount(0);
    }
    await swipe(page, right, true);
    await expect(drawer(page)).toHaveCount(0);
    await page.locator('.chat-empty p').evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    });
    await swipe(page, right);
    await expect(drawer(page)).toHaveCount(0);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: 90, y: 300, id: 0 }, { x: 120, y: 300, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: 220, y: 300, id: 0 }, { x: 250, y: 300, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await expect(drawer(page)).toHaveCount(0);
    await swipe(page, right);
    await expect(drawer(page)).toBeVisible();
  });

test('preserves message scrolling and horizontal table scrolling', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'Touch scrolling is exercised by the mobile browser project.');
  await request.post(`${fixtureUrl}/test/sidebar`, { data: { action: 'web-parity' } });
  await page.getByRole('button', { name: '打开聊天列表' }).click();
  await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
  await expect(drawer(page)).toHaveCount(0);
  const messages = page.locator('.chat-messages');
  await messages.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const before = await messages.evaluate(node => node.scrollTop);
  await swipe(page, [{ x: 250, y: 250 }, { x: 250, y: 280 }, { x: 252, y: 350 }, { x: 252, y: 450 }]);
  await expect.poll(() => messages.evaluate(node => node.scrollTop)).toBeLessThan(before);
  await expect(drawer(page)).toHaveCount(0);
  const table = page.locator('.chat-messages table');
  await table.evaluate(node => {
    node.querySelectorAll<HTMLElement>('th,td').forEach(cell => { cell.style.minWidth = '400px'; });
    node.scrollLeft = 160;
  });
  await table.scrollIntoViewIfNeeded();
  const bounds = await table.boundingBox();
  if (!bounds) throw new Error('Missing horizontal table');
  const y = bounds.y + bounds.height / 2;
  await swipe(page, [{ x: 90, y }, { x: 120, y }, { x: 170, y }, { x: 240, y }]);
  await expect.poll(() => table.evaluate(node => node.scrollLeft)).toBeLessThan(160);
  await expect(drawer(page)).toHaveCount(0);
});

test('keeps desktop mouse selection and button navigation available', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse behavior is exercised by the desktop browser project.');
  await page.mouse.move(400, 300); await page.mouse.down();
  await page.mouse.move(650, 310, { steps: 10 }); await page.mouse.up();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator('.chat-sidebar')).toBeVisible();
  await page.locator('.chat-header').getByRole('button', { name: '收起聊天列表' }).click();
  await expect(page.locator('.chat-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: '打开聊天列表' }).click();
  await expect(page.locator('.chat-sidebar')).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
});

test('keeps desktop chat beside independently collapsible menus and remembers the layout',
  async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'Desktop uses persistent sidebars.');
    const sidebar = page.locator('.chat-sidebar');
    const header = page.locator('.chat-header');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.desktop-topbar')).toHaveCount(0);
    expect((await header.boundingBox())!.y).toBe(0);
    await sidebar.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await send(page, 'slow sidebar layout test');
    await expect(page.getByRole('button', { name: '暂停生成' })).toBeVisible();
    await page.getByRole('textbox', { name: '聊天消息' }).fill('保留未发送草稿');
    await page.getByRole('button', { name: '收起主菜单' }).click();
    await expect(page.locator('.desktop-sidebar nav')).toBeVisible();
    await expect(page.locator('.desktop-sidebar .brand-mark')).toBeVisible();
    await expect(page.locator('.desktop-sidebar nav').getByRole('button')).toHaveCount(5);
    await expect(page.locator('.desktop-sidebar nav').getByRole('button', { name: '聊天', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.desktop-sidebar').getByRole('button', { name: '展开主菜单' })).toBeVisible();
    await expect(sidebar).toBeVisible();
    await header.getByRole('button', { name: '收起聊天列表' }).click();
    await expect(sidebar).toHaveCount(0);
    const mainToggle = (await page.locator('.main-menu-toggle svg').boundingBox())!;
    const chatToggle = (await header.locator('.chat-back > svg').boundingBox())!;
    expect(mainToggle.y + mainToggle.height / 2).toBe(chatToggle.y + chatToggle.height / 2);
    await screenshot(page, info, 'desktop-collapsed-menus');
    const text = await page.locator('.chat-markdown').last().innerText();
    await expect.poll(() => page.locator('.chat-markdown').last().innerText()).not.toBe(text);
    await page.getByRole('button', { name: '打开聊天列表' }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('textbox', { name: '聊天消息' })).toHaveValue('保留未发送草稿');
    await page.getByRole('button', { name: '展开主菜单' }).click();
    await screenshot(page, info, 'desktop-three-columns');
    for (const width of [861, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('textbox', { name: '聊天消息' }).fill('');
    await page.getByRole('button', { name: '暂停生成' }).click();
    await settled(page);
    await page.getByRole('button', { name: '收起主菜单' }).click();
    await header.getByRole('button', { name: '收起聊天列表' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: '展开主菜单' })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开聊天列表' })).toBeVisible();
    await expect(sidebar).toHaveCount(0);
    await page.getByRole('button', { name: '打开聊天列表' }).click();
    await expect(sidebar).toBeVisible();
    const menu = page.locator('.desktop-sidebar nav');
    await menu.getByRole('button', { name: '设置', exact: true }).hover();
    await expect(page.getByRole('tooltip', { name: '设置', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: '设置', exact: true }).click();
    await expect(menu.getByRole('button', { name: '设置', exact: true })).toHaveAttribute('aria-current', 'page');
    await menu.getByRole('button', { name: '聊天', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: '展开主菜单' })).toBeVisible();
  });
