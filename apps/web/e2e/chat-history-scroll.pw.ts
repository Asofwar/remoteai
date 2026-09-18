import { expect, test, type Page } from '@playwright/test';
import type { Thread, Turn } from '../src/chat/types';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'Mouse wheel interaction'));

function turn(id: string, text = '一条聊天消息。'): Turn {
  return { id, status: 'completed', items: [{ id, type: 'agentMessage', phase: 'final_answer', text }] };
}

async function open(page: Page, text?: string) {
  const thread: Thread = { id: 'history', cwd: '', preview: '', updatedAt: 1, turns: [turn('latest', text)] };
  await page.route('**/display-fixture.json', route => route.fulfill({ json: thread }));
  await page.goto('e2e/chat-display-harness.html?history');
  await expect(page.locator('[data-message-id="latest"]')).toBeVisible();
}

async function wheel(page: Page, deltaY: number) {
  const viewport = page.getByLabel('聊天记录');
  await viewport.hover({ position: { x: 10, y: 10 } });
  await page.mouse.wheel(0, deltaY);
}

test('loads short history on upward wheel, prevents overlap and preserves the reading position', async ({ page }) => {
  let requests = 0;
  let finish = () => {};
  await page.route('**/display-history.json', async route => {
    requests++;
    await new Promise<void>(resolve => { finish = resolve; });
    const turns = Array.from({ length: 12 }, (_, index) => turn(`older-${requests}-${index}`));
    await route.fulfill({ json: { turns, hasMore: requests < 2 } });
  });
  await open(page);
  const viewport = page.getByLabel('聊天记录');
  expect(await viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
  expect(requests).toBe(0);
  const latest = page.locator('[data-message-id="latest"]');
  await wheel(page, -120);
  await expect(page.getByRole('status')).toContainText('正在加载聊天记录');
  for (let step = 0; step < 3; step++) await wheel(page, -120);
  expect(requests).toBe(1);
  finish();
  await expect(page.locator('.chat-entry-message')).toHaveCount(13);
  // A short page has no room below its last message to preserve its exact vertical offset.
  await expect(latest).toBeInViewport();
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(2);
  await wheel(page, -40);
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  expect(requests).toBe(1);
  await wheel(page, -10000);
  await expect(page.getByRole('status')).toContainText('正在加载聊天记录');
  const first = page.locator('[data-message-id="older-1-0"]');
  const top = (await first.boundingBox())!.y;
  finish();
  await expect(page.locator('.chat-entry-message')).toHaveCount(25);
  await expect.poll(async () => Math.abs((await first.boundingBox())!.y - top)).toBeLessThan(3);
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toHaveCount(0);
  await wheel(page, -10000);
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(0);
  await wheel(page, -120);
  expect(requests).toBe(2);
});

test('ignores downward, horizontal and zoom wheels while retaining manual history loading', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: [turn('older')], hasMore: false } });
  });
  await open(page);
  await wheel(page, 120);
  await page.mouse.wheel(120, 0);
  await page.getByLabel('聊天记录').dispatchEvent('wheel', { deltaY: -120, ctrlKey: true });
  await expect(page.getByRole('button', { name: '加载更早的消息' })).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '加载更早的消息' }).click();
  await expect(page.locator('[data-message-id="older"]')).toBeVisible();
  expect(requests).toBe(1);
});

test('lets nested code scroll upward without fetching earlier chat messages', async ({ page }) => {
  let requests = 0;
  await page.route('**/display-history.json', route => {
    requests++;
    return route.fulfill({ json: { turns: [turn('older')], hasMore: false } });
  });
  await page.setViewportSize({ ...page.viewportSize()!, height: 1200 });
  await open(page, `\`\`\`text\n${'代码内容\n'.repeat(80)}\`\`\``);
  const viewport = page.getByLabel('聊天记录');
  const code = page.locator('.chat-code-block pre');
  await code.evaluate(node => { node.scrollTop = 200; });
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(0);
  await code.hover();
  await page.mouse.wheel(0, -80);
  await expect.poll(() => code.evaluate(node => node.scrollTop)).toBeLessThan(200);
  expect(requests).toBe(0);
  await code.evaluate(node => { node.scrollTop = 0; });
  await page.mouse.wheel(0, -120);
  await expect(page.locator('[data-message-id="older"]')).toBeVisible();
  expect(requests).toBe(1);
});
