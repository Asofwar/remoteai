import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectReadableQuestion(panel: Locator) {
  const colors = await panel.getByRole('log').locator('article').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const foreground = luminance(colors.foreground);
  const background = luminance(colors.background);
  expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05))
    .toBeGreaterThanOrEqual(4.5);
}

async function mockBackend(page: Page, options: { status?: string; wait?: Promise<void> } = {}) {
  const stats = { asks: 0, polls: 0 };
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/__codex_switch__/api/invoke', async (route) => {
    const { command } = route.request().postDataJSON() as { command: string };
    let result: unknown = {};
    if (command === 'remote_ai_help_status') result = { status: options.status ?? 'ready', accountRevision: 7 };
    if (command === 'codex_gui_events') result = { cursor: { streamId: 'test', sequence: 0 }, reset: false, events: [] };
    if (command === 'get_proxy_session_unlimited_conversation') result = false;
    if (command === 'list_proxy_sessions') { stats.polls++; result = []; }
    if (command === 'remote_ai_help_ask') {
      stats.asks++; await options.wait;
      result = { text: '可以在 **Codex** 页面选择账户。\n\n1. 打开账户选择菜单。\n2. 选择可用账户。',
        sources: ['docs/codex-gui.md'] };
    }
    await route.fulfill({ json: { ok: true, result } });
  });
  return stats;
}

test('help remains responsive during requests and session polling on every sidebar page', async ({ page }) => {
  let release = () => {};
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const stats = await mockBackend(page, { wait });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/e2e/help-assistant-harness.html');
  await page.getByRole('button', { name: '问题解答助手', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '问题解答助手' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('怎么选择账户？');
  await panel.getByRole('button', { name: '发送', exact: true }).click();
  await expect(panel).toContainText('正在查找答案');
  try {
    for (let count = 0; count < 5; count++) {
      await page.getByRole('button', { name: `Click ${count}`, exact: true }).click({ timeout: 2_000 });
    }
    await expect.poll(() => stats.polls).toBeGreaterThanOrEqual(3);
    expect(stats.asks).toBe(1);
    for (const menu of await page.locator('aside button').all()) {
      await menu.click(); await expect(panel).toBeVisible();
    }
    await page.screenshot({ path: '../../.codex-tmp/help-pending-desktop.png', animations: 'disabled' });
  } finally { release(); }
  await expect(panel).toContainText('可以在 Codex 页面选择账户');
  await expectReadableQuestion(panel);
  await page.screenshot({ path: '../../.codex-tmp/help-answer-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(400);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(panel.getByRole('textbox')).toBeInViewport();
  await expectReadableQuestion(panel);
  await page.screenshot({ path: '../../.codex-tmp/help-answer-narrow-dark.png', animations: 'disabled' });
});

for (const status of ['installRequired', 'initializeRequired', 'accountRequired']) {
  test(`help guides ${status} without answering`, async ({ page }) => {
    const stats = await mockBackend(page, { status });
    await page.goto('/e2e/help-assistant-harness.html');
    await page.getByRole('button', { name: '问题解答助手', exact: true }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('textbox')).toBeDisabled();
    await panel.getByRole('button', { name: '前往 Codex', exact: true }).click();
    await expect(page.getByLabel('Current page')).toHaveText('codexGui');
    expect(stats.asks).toBe(0);
  });
}
