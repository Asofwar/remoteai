import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Thread } from '../src/chat/types';

async function open(page: Page) {
  const thread: Thread = { id: 'scroll-bottom', cwd: '', preview: '', updatedAt: 1, turns: [{
    id: 'turn', status: 'completed', items: [{ id: 'reply', type: 'agentMessage', phase: 'final_answer',
      text: Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 段聊天内容。`).join('\n\n') }],
  }] };
  await page.route('**/display-fixture.json', route => route.fulfill({ json: thread }));
  await page.goto('e2e/chat-display-harness.html');
  await expect(page.locator('[data-message-id="reply"]')).toBeVisible();
  const viewport = page.getByLabel('聊天记录');
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(2);
  return viewport;
}

async function leaveRemaining(viewport: Locator, remaining: number) {
  await viewport.evaluate((node, distance) => {
    node.scrollTop = node.scrollHeight - node.clientHeight - distance;
    node.dispatchEvent(new Event('scroll'));
  }, remaining);
}

test('shows the bottom shortcut only beyond one fifth of the visible chat height', async ({ page }, info) => {
  const viewport = await open(page);
  const button = page.getByRole('button', { name: '回到底部' });
  await expect(button).toHaveCount(0);
  const threshold = await viewport.evaluate(node => node.clientHeight * 0.2);
  await leaveRemaining(viewport, Math.floor(threshold));
  await expect(button).toHaveCount(0);
  await leaveRemaining(viewport, Math.ceil(threshold) + 1);
  await expect(button).toBeVisible();
  await page.screenshot({ path: info.outputPath('above-threshold.png') });
  await button.click();
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(2);
  await expect(button).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('at-bottom.png') });
});

test('refreshes the shortcut when content grows or collapses without scrolling', async ({ page }) => {
  const viewport = await open(page);
  const button = page.getByRole('button', { name: '回到底部' });
  // Stay outside the auto-follow distance but within the shortcut threshold.
  await leaveRemaining(viewport, 110);
  await expect(button).toHaveCount(0);
  const position = await viewport.evaluate(node => node.scrollTop);
  const content = viewport.locator('.chat-message-content');
  await content.evaluate(node => { (node as HTMLElement).style.paddingBottom = '400px'; });
  await expect(button).toBeVisible();
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(position);
  await content.evaluate(node => { (node as HTMLElement).style.paddingBottom = ''; });
  await expect(button).toHaveCount(0);
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(position);
});

test('rechecks the threshold when the visible chat area changes height', async ({ page }) => {
  const viewport = await open(page);
  await viewport.evaluate(node => { node.parentElement!.style.flex = '0 0 500px'; });
  await expect.poll(() => viewport.evaluate(node => node.clientHeight)).toBe(500);
  await leaveRemaining(viewport, 120);
  const button = page.getByRole('button', { name: '回到底部' });
  await expect(button).toBeVisible();
  const position = await viewport.evaluate(node => node.scrollTop);
  await viewport.evaluate(node => { node.parentElement!.style.flex = '0 0 600px'; });
  await expect(button).toHaveCount(0);
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(position);
});
