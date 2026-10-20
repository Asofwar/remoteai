import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Thread, Turn } from '../src/chat/types';

function turn(id: string, text = '一条聊天消息。'): Turn {
  return { id, status: 'completed', items: [{ id, type: 'agentMessage', phase: 'final_answer', text }] };
}

async function open(page: Page, text?: string) {
  const thread: Thread = { id: 'history', cwd: '', preview: '', updatedAt: 1, turns: [turn('latest', text)] };
  await page.route('**/display-fixture.json', route => route.fulfill({ json: thread }));
  await page.goto('e2e/chat-display-harness.html?history');
  await expect(page.locator('[data-message-id="latest"]')).toBeVisible();
}

async function pull(page: Page) {
  const bounds = (await page.getByLabel('聊天记录').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + 100;
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [20, 40, 80, 120]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + distance }] });
    }
    // Release a stationary finger so fling momentum does not move the newly loaded reading position.
    await page.waitForTimeout(150);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 120 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

async function touch(target: Locator, type: string, points: { x: number; y: number }[]) {
  await target.dispatchEvent(type, { touches: points.map(({ x, y }, identifier) => ({
    identifier, clientX: x, clientY: y, pageX: x, pageY: y,
  })) });
}

test('loads at the top with a real touch pull, prevents overlap and preserves readable history', async ({ page }) => {
  let requests = 0;
  let finish = () => {};
  await page.route('**/display-history.json', async route => {
    requests++;
    await new Promise<void>(resolve => { finish = resolve; });
    const turns = Array.from({ length: 12 }, (_, index) => turn(`older-${index}`));
    await route.fulfill({ json: { turns, hasMore: false } });
  });
  await open(page);
  const viewport = page.getByLabel('聊天记录');
  expect(await viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
  await pull(page);
  await expect(page.getByRole('button', { name: '加载中…', exact: true })).toBeDisabled();
  await pull(page);
  expect(requests).toBe(1);
  finish();
  await expect(page.locator('.chat-entry-message')).toHaveCount(13);
  await expect(page.locator('[data-message-id="latest"]')).toBeInViewport();
  await expect(page.getByText(/已加载 \d+ 条历史记录/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toHaveCount(0);
  await viewport.evaluate(node => { node.scrollTop = 0; });
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(0);
  await pull(page);
  expect(requests).toBe(1);
});

test('continues through short pages without another pull until the history is exhausted', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: [turn(`older-${requests}`)], hasMore: requests < 2 } });
  });
  await open(page);
  await pull(page);
  await expect(page.locator('[data-message-id="older-2"]')).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toHaveCount(0);
});

test('continues past collapsed work and stops once enough content is available', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    const turns: Turn[] = requests < 3 ? [{ id: `work-${requests}`, status: 'completed',
      items: Array.from({ length: 20 }, (_, index) => ({ id: `tool-${requests}-${index}`,
        type: 'commandExecution', status: 'completed', command: 'echo history' })) }]
      : Array.from({ length: 24 }, (_, index) => turn(`older-${index}`));
    return route.fulfill({ json: { turns, hasMore: true } });
  });
  await open(page);
  await pull(page);
  await expect(page.locator('[data-message-id="older-0"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toBeEnabled();
  expect(requests).toBe(3);
  const viewport = page.getByLabel('聊天记录');
  expect(await viewport.evaluate(node => node.scrollTop > node.clientHeight / 2)).toBe(true);
  await expect(page.locator('[data-message-id="latest"]')).toBeInViewport();
});

test('stops an empty page without retrying indefinitely and keeps manual retry available', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: requests === 1 ? [] : [turn('older')], hasMore: requests === 1 } });
  });
  await open(page);
  await pull(page);
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toBeEnabled();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: '加载更早的消息' }).click();
  await expect(page.locator('[data-message-id="older"]')).toBeVisible();
  expect(requests).toBe(2);
});

test('prefetches half a viewport before the top and keeps the current message in place', async ({ page }, info) => {
  let requests = 0;
  let finish = () => {};
  const thread: Thread = { id: 'history', cwd: '', preview: '', updatedAt: 1,
    turns: Array.from({ length: 30 }, (_, index) => turn(`current-${index}`)) };
  await page.route('**/display-fixture.json', route => route.fulfill({ json: thread }));
  await page.route('**/display-history.json', async route => {
    requests++;
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { turns: Array.from({ length: 10 }, (_, index) => turn(`older-${index}`)),
      hasMore: true } });
  });
  await page.goto('e2e/chat-display-harness.html?history');
  const viewport = page.getByLabel('聊天记录');
  await expect(page.locator('[data-message-id="current-29"]')).toBeInViewport();
  expect(requests).toBe(0);
  await viewport.evaluate(node => { node.scrollTop = node.clientHeight / 2 + 20; });
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  expect(requests).toBe(0);
  await viewport.evaluate(node => { node.scrollTop = Math.floor(node.clientHeight / 2); });
  await expect(page.getByRole('button', { name: '加载中…', exact: true })).toBeDisabled();
  expect(requests).toBe(1);
  const anchor = await viewport.evaluate(node => {
    const top = node.getBoundingClientRect().top;
    const entry = [...node.querySelectorAll('[data-message-id]')]
      .find(item => item.getBoundingClientRect().bottom > top)!;
    return { id: entry.getAttribute('data-message-id'), top: entry.getBoundingClientRect().top };
  });
  finish();
  await expect(page.locator('.chat-entry-message')).toHaveCount(40);
  await expect.poll(async () => Math.abs((await page.locator(`[data-message-id="${anchor.id}"]`)
    .boundingBox())!.y - anchor.top)).toBeLessThan(3);
  expect(requests).toBe(1);
  await page.screenshot({ path: info.outputPath('history-prefetch.png') });
});

test('ignores sideways, upward, cancelled and multitouch gestures while keeping the load button', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: [turn('older')], hasMore: false } });
  });
  await open(page);
  const viewport = page.getByLabel('聊天记录');
  for (const points of [[{ x: 200, y: 200 }], [{ x: 100, y: 50 }], [{ x: 100, y: 200 }, { x: 120, y: 200 }]]) {
    await touch(viewport, 'touchstart', [{ x: 100, y: 100 }]);
    await touch(viewport, 'touchmove', points);
    await touch(viewport, 'touchend', []);
  }
  await touch(viewport, 'touchstart', [{ x: 100, y: 100 }]);
  await touch(viewport, 'touchcancel', []);
  await touch(viewport, 'touchmove', [{ x: 100, y: 200 }]);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '加载更早的消息' }).click();
  await expect(page.locator('[data-message-id="older"]')).toBeVisible();
  expect(requests).toBe(1);
});

test('does not load history when pulling inside a code block that can still scroll up', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: [turn('older')], hasMore: false } });
  });
  await page.setViewportSize({ ...page.viewportSize()!, height: 1200 });
  await open(page, `\`\`\`text\n${'代码内容\n'.repeat(80)}\`\`\``);
  const code = page.locator('.chat-code-block pre');
  await code.evaluate(node => { node.scrollTop = 200; });
  await touch(code, 'touchstart', [{ x: 100, y: 100 }]);
  await touch(code, 'touchmove', [{ x: 100, y: 200 }]);
  await touch(code, 'touchend', []);
  expect(requests).toBe(0);
  await code.evaluate(node => { node.scrollTop = 0; });
  await touch(code, 'touchstart', [{ x: 100, y: 100 }]);
  await touch(code, 'touchmove', [{ x: 100, y: 200 }]);
  await expect(page.locator('[data-message-id="older"]')).toBeVisible();
  expect(requests).toBe(1);
});
