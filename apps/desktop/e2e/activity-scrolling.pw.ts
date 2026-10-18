import { expect, test, type Page } from '@playwright/test';
import type { Conversation } from '../src/pages/codexGui/types';

const ACTIVITY_COUNT = 180;
function fixture(): Conversation {
  return { thread: { id: 'activity-scroll', cwd: '', preview: '', updatedAt: 1 },
    activeTurn: 'turn', tokens: 0, error: '', turns: [{ id: 'turn', status: 'inProgress',
      items: Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({ id: `activity-${index}`,
        type: 'agentMessage', phase: 'commentary', text: `正在检查第 ${index} 项活动。` })),
    }] };
}

async function scrollPage(page: Page, direction: 'older' | 'newer') {
  const viewport = page.getByLabel('对话消息');
  const rows = viewport.locator('[data-message-id]');
  const before = await rows.first().getAttribute('data-message-id');
  const anchor = await viewport.evaluate((node, direction) => {
    node.scrollTop = direction === 'older' ? 0 : node.scrollHeight;
    const bounds = node.getBoundingClientRect();
    const visible = [...node.querySelectorAll<HTMLElement>('[data-message-id]')]
      .filter(row => row.getBoundingClientRect().bottom > bounds.top
        && row.getBoundingClientRect().top < bounds.bottom);
    const row = visible[Math.floor(visible.length / 2)];
    return { id: row.dataset.messageId!, top: row.getBoundingClientRect().top };
  }, direction);
  await expect.poll(() => rows.first().getAttribute('data-message-id')).not.toBe(before);
  await expect(rows).toHaveCount(50);
  await expect.poll(async () => page.locator(`[data-message-id="${anchor.id}"]`)
    .evaluate((node, top) => Math.abs(node.getBoundingClientRect().top - top), anchor.top)).toBeLessThan(3);
}

for (const width of [390, 1280]) {
  test(`activity history scrolls both ways without buttons or reading jumps at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.route('**/history-fixture.json', route => route.fulfill({ json: fixture() }));
    await page.goto('/e2e/tool-history-harness.html');
    const rows = page.locator('[data-message-id]');
    await expect(rows).toHaveCount(50);
    await expect(rows.last()).toHaveAttribute('data-message-id', 'activity-179');
    await expect(page.getByRole('button', { name: /查看更早的活动|查看后续活动|回到最新活动/ })).toHaveCount(0);
    for (let index = 0; index < 6; index++) await scrollPage(page, 'older');
    await expect(rows.first()).toHaveAttribute('data-message-id', 'activity-0');
    for (let index = 0; index < 6; index++) await scrollPage(page, 'newer');
    await expect(rows.last()).toHaveAttribute('data-message-id', 'activity-179');
    await scrollPage(page, 'older');
    const first = await rows.first().getAttribute('data-message-id');
    await page.evaluate(value => window.dispatchEvent(new CustomEvent('conversation-fixture', { detail: value })), {
      ...fixture(), turns: [{ ...fixture().turns[0], items: [...fixture().turns[0].items,
        { id: 'new', type: 'agentMessage', phase: 'commentary', text: '新活动已到达。' }] }],
    });
    await expect(rows.first()).toHaveAttribute('data-message-id', first!);
    await page.getByLabel('消息', { exact: true }).fill('翻阅时可以继续输入');
    await expect(page.getByLabel('消息', { exact: true })).toHaveValue('翻阅时可以继续输入');
    await page.getByRole('button', { name: '回到最新消息', exact: true }).click();
    await expect(page.locator('[data-message-id="new"]')).toBeInViewport();
    await page.screenshot({ path: `../../.codex-tmp/activity-scrolling-${width}.png` });
  });
}

test('scrolling an expanded command run retains its disclosure and overlapping command output', async ({ page }) => {
  const value = fixture();
  value.turns[0].items = Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({ id: `activity-${index}`,
    type: 'commandExecution', status: 'completed', command: `echo ${index}`, aggregatedOutput: `output-${index}` }));
  await page.route('**/history-fixture.json', route => route.fulfill({ json: value }));
  await page.goto('/e2e/tool-history-harness.html');
  const group = page.locator('[data-activity-group="activity-0"] > details');
  await group.locator(':scope > summary').click();
  const command = page.locator('[data-message-id="activity-150"] > details');
  await command.locator('summary').click();
  await expect(command).toHaveAttribute('open');
  await scrollPage(page, 'older');
  await expect(group).toHaveAttribute('open');
  await expect(command).toHaveAttribute('open');
  await expect(command).toContainText('output-150');
});

test('one upward wheel reaches explanations before a collapsed run without visible pagination', async ({ page }) => {
  const value = fixture();
  value.turns[0].items = [{ id: 'before', type: 'agentMessage', phase: 'commentary', text: '开始检查。' },
    ...Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({ id: `activity-${index}`,
      type: 'commandExecution', status: 'completed', command: `echo ${index}` }))];
  await page.route('**/history-fixture.json', route => route.fulfill({ json: value }));
  await page.goto('/e2e/tool-history-harness.html');
  const group = page.locator('[data-activity-group="activity-0"] > details');
  await group.hover();
  await page.mouse.wheel(0, -200);
  await expect(page.locator('[data-message-id="before"]')).toBeInViewport();
  await expect(group).not.toHaveAttribute('open');
  await expect(group.locator('summary')).toContainText('echo 179');
});
