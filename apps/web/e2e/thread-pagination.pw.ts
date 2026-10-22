import { expect, test, type Page } from '@playwright/test';
import type { Thread } from '../src/chat/types';

function threads(start: number, count: number, grouped = false): Thread[] {
  return Array.from({ length: count }, (_, index) => ({ id: `chat-${start + index}`,
    name: `聊天 ${start + index}`, preview: '', updatedAt: 1, cwd: grouped ? '/project' : `/project-${start + index}` }));
}

async function scrollDown(page: Page, touch: boolean) {
  const list = page.locator('.chat-thread-list');
  const box = (await list.boundingBox())!;
  const x = box.x + box.width / 2;
  if (!touch) {
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.wheel(0, box.height);
    return;
  }
  const session = await page.context().newCDPSession(page);
  try {
    const start = box.y + box.height - 30;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
    for (let step = 1; step <= 8; step++) {
      const y = start - (box.height - 60) * step / 8;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

test('refills at 70% of the buffered screen and preserves the idle reading position',
  async ({ page, isMobile }) => {
    let requests = 0;
    let finish = () => {};
    const pending = new Promise<void>(resolve => { finish = resolve; });
    await page.route('**/thread-page?*', async route => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      if (!cursor) return route.fulfill({ json: { data: threads(0, 24), nextCursor: 'next' } });
      requests++;
      await pending;
      await route.fulfill({ json: { data: threads(24, 24), nextCursor: null } });
    });
    await page.goto('./e2e/thread-pagination-harness.html');
    await expect(page.locator('.chat-thread')).toHaveCount(24);
    await expect(page.getByRole('button', { name: '加载更多', exact: true })).toHaveCount(0);
    await expect(page.getByText('向下滚动，查看更多')).toHaveCount(0);
    expect(requests).toBe(0);
    const list = page.locator('.chat-thread-list');
    await list.evaluate(async node => {
      node.scrollTop = Math.ceil(node.scrollHeight - node.clientHeight * 1.3) - 1;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(requests).toBe(0);
    await list.evaluate(node => { node.scrollTop = Math.ceil(node.scrollHeight - node.clientHeight * 1.3); });
    await expect(page.getByRole('status')).toHaveText('正在加载…');
    expect(requests).toBe(1);
    const remaining = await list.evaluate(node => (node.scrollHeight - node.clientHeight - node.scrollTop)
      / node.clientHeight);
    expect(remaining).toBeGreaterThan(0.29);
    expect(remaining).toBeLessThanOrEqual(0.3);
    await list.evaluate(async node => {
      node.scrollTop = node.scrollHeight;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(requests).toBe(1);
    await expect.poll(() => list.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
      .toBeLessThan(2);
    const position = await list.evaluate(node => node.scrollTop);
    finish();
    await expect(page.locator('.chat-thread')).toHaveCount(48);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await list.evaluate(node => node.scrollTop)).toBe(position);
    await scrollDown(page, isMobile);
    expect(requests).toBe(1);
    await page.screenshot({ path: `../../.codex-tmp/thread-prefetch-${isMobile ? 'mobile' : 'desktop'}.png` });
  });

test('coalesces real mouse or touch scrolling while the next page is pending', async ({ page, isMobile }) => {
  let requests = 0;
  let finish = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/thread-page?*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (!cursor) return route.fulfill({ json: { data: threads(0, 24), nextCursor: 'next' } });
    requests++;
    await pending;
    await route.fulfill({ json: { data: threads(24, 24), nextCursor: null } });
  });
  await page.goto('./e2e/thread-pagination-harness.html');
  await expect(page.locator('.chat-thread')).toHaveCount(24);
  for (let step = 0; step < 6 && requests === 0; step++) await scrollDown(page, isMobile);
  await expect(page.getByRole('status')).toHaveText('正在加载…');
  for (let step = 0; step < 3; step++) await scrollDown(page, isMobile);
  expect(requests).toBe(1);
  finish();
  await expect(page.locator('.chat-thread')).toHaveCount(48);
  await expect(page.getByRole('status')).toHaveCount(0);
  await scrollDown(page, isMobile);
  expect(requests).toBe(1);
});

test('fills a short collapsed list across pages and stops when there are no more chats', async ({ page }) => {
  const cursors: string[] = [];
  await page.route('**/thread-page?*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor') ?? '';
    cursors.push(cursor);
    const start = cursor ? Number(cursor) : 0;
    await route.fulfill({ json: { data: threads(start, 6, true), nextCursor: start < 12 ? String(start + 6) : null } });
  });
  await page.goto('./e2e/thread-pagination-harness.html');
  await expect.poll(() => cursors).toEqual(['', '6', '12']);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.chat-thread')).toHaveCount(5);
  await page.getByRole('button', { name: '展开显示：project' }).click();
  await expect(page.locator('.chat-thread')).toHaveCount(18);
});

test('pauses automatic loading after failure and retries the same page on request', async ({ page }) => {
  let attempts = 0;
  await page.route('**/thread-page?*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (!cursor) return route.fulfill({ json: { data: threads(0, 1), nextCursor: 'next' } });
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503 });
    await route.fulfill({ json: { data: threads(1, 1), nextCursor: null } });
  });
  await page.goto('./e2e/thread-pagination-harness.html');
  await page.getByRole('button', { name: '加载失败，点击重试' }).click();
  await expect(page.locator('.chat-thread')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '加载失败，点击重试' })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('coalesces background list updates while keeping chats visible and shows progress on manual refresh',
  async ({ page }) => {
    let requests = 0;
    let finish = () => {};
    const pending = new Promise<void>(resolve => { finish = resolve; });
    await page.route('**/thread-page?*', async route => {
      requests++;
      if (requests === 2) await pending;
      await route.fulfill({ json: { data: threads(0, 6, true), nextCursor: null } });
    });
    await page.goto('./e2e/thread-pagination-harness.html');
    await expect(page.locator('.chat-thread')).toHaveCount(5);
    const refresh = page.getByRole('button', { name: '刷新聊天', exact: true });
    await expect(refresh).toBeEnabled();
    await page.evaluate(() => {
      for (let index = 0; index < 50; index++) window.dispatchEvent(new CustomEvent('test-chat-event', {
        detail: { method: 'remote-chat/history-changed', params: { threadId: 'chat-0', reason: 'thread/resumed' } },
      }));
    });
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('.chat-thread-list')).toHaveAttribute('aria-busy', 'true');
    await expect(refresh.locator('.chat-spinner')).toHaveCount(0);
    await expect(page.locator('.chat-thread')).toHaveCount(5);
    await expect(refresh).toBeEnabled();
    let finishManual = () => {};
    const manual = new Promise<void>(resolve => { finishManual = resolve; });
    await page.route('**/thread-page?*', async route => {
      requests++;
      await manual;
      await route.fulfill({ json: { data: threads(10, 6, true), nextCursor: null } });
    });
    await refresh.click();
    await expect(refresh.locator('.chat-spinner')).toHaveCount(1);
    await expect(page.locator('.chat-thread')).toHaveCount(5);
    expect(requests).toBe(2);
    finish();
    await expect.poll(() => requests).toBe(3);
    await expect(refresh.locator('.chat-spinner')).toHaveCount(1);
    finishManual();
    await expect(refresh).toBeEnabled();
    await expect(refresh.locator('.chat-spinner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '聊天 10', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '聊天 0', exact: true })).toHaveCount(0);
  });

test('keeps a live rename when an older page arrives and refreshes a newly completed chat', async ({ page }) => {
  let requests = 0;
  let finish = () => {};
  let finishLatest = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const latest = new Promise<void>(resolve => { finishLatest = resolve; });
  await page.route('**/thread-page?*', async route => {
    const index = ++requests;
    if (index === 2) await pending;
    if (index === 3) await latest;
    const data = index < 3 ? threads(0, 1) : [{ ...threads(1, 1)[0], name: '最新完成的聊天' },
      { ...threads(0, 1)[0], name: '更新后的标题' }];
    await route.fulfill({ json: { data, nextCursor: null } });
  });
  await page.goto('./e2e/thread-pagination-harness.html');
  await expect(page.getByRole('button', { name: '聊天 0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新聊天', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await page.evaluate(() => {
    const emit = (method: string, params: object) => window.dispatchEvent(new CustomEvent('test-chat-event', {
      detail: { method, params },
    }));
    emit('thread/name/updated', { threadId: 'chat-0', threadName: '更新后的标题' });
    emit('turn/completed', { threadId: 'chat-1', turn: { id: 'turn', status: 'completed', items: [] } });
  });
  await expect(page.getByRole('button', { name: '更新后的标题', exact: true })).toBeVisible();
  finish();
  await expect.poll(() => requests).toBe(3);
  await expect(page.getByRole('button', { name: '更新后的标题', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '聊天 0', exact: true })).toHaveCount(0);
  finishLatest();
  await expect(page.getByRole('button', { name: '最新完成的聊天', exact: true })).toBeVisible();
  await expect(page.locator('.chat-thread').first()).toContainText('最新完成的聊天');
});
