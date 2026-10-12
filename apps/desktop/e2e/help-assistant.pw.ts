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
  const stats = { asks: 0, polls: 0, installs: 0, connections: 0, requests: [] as unknown[] };
  let status = options.status ?? 'ready';
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/__codex_switch__/api/invoke', async (route) => {
    const { command } = route.request().postDataJSON() as { command: string };
    let result: unknown = {};
    if (command === 'remote_ai_help_status') result = { status, accountRevision: 7 };
    if (command === 'codex_gui_cli_status') result = { version: null, release: null };
    if (command === 'codex_gui_cli_release') result = { version: '0.99.0', size: 100 };
    if (command === 'codex_gui_cli_install') {
      stats.installs++; status = 'initializeRequired'; result = { version: '0.99.0' };
    }
    if (command === 'codex_gui_connect') { stats.connections++; status = 'accountRequired'; result = []; }
    if (command === 'codex_gui_events') result = { cursor: { streamId: 'test', sequence: 0 }, reset: false, events: [] };
    if (command === 'get_proxy_session_unlimited_conversation') result = false;
    if (command === 'list_proxy_sessions') { stats.polls++; result = []; }
    if (command === 'remote_ai_help_ask') {
      stats.asks++; stats.requests.push(route.request().postDataJSON()); await options.wait;
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

for (const status of ['installRequired', 'initializeRequired']) {
  test(`help resolves ${status} in place before choosing an account`, async ({ page }) => {
    const stats = await mockBackend(page, { status });
    await page.goto('/e2e/help-assistant-harness.html');
    await page.getByRole('button', { name: '问题解答助手', exact: true }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('textbox')).toBeDisabled();
    const action = status === 'installRequired' ? '立即安装' : '启用助手';
    await expect(panel.getByRole('button', { name: action, exact: true })).toBeVisible();
    if (status === 'installRequired') {
      await page.screenshot({ path: '../../.codex-tmp/help-direct-install.png', animations: 'disabled' });
    }
    expect(stats.installs).toBe(0);
    await panel.getByRole('button', { name: action, exact: true }).click();
    await expect(panel.getByRole('button', { name: '选择账户', exact: true })).toBeVisible();
    await expect(page.getByLabel('Current page')).toHaveText('accounts');
    expect(stats.installs).toBe(status === 'installRequired' ? 1 : 0);
    expect(stats.connections).toBe(1);
    await panel.getByRole('button', { name: '选择账户', exact: true }).click();
    await expect(page.getByLabel('Current page')).toHaveText('codexGui');
    expect(stats.asks).toBe(0);
  });
}

test('help guides account selection without installing or answering', async ({ page }) => {
  const stats = await mockBackend(page, { status: 'accountRequired' });
  await page.goto('/e2e/help-assistant-harness.html');
  await page.getByRole('button', { name: '问题解答助手', exact: true }).click();
  await page.getByRole('button', { name: '选择账户', exact: true }).click();
  await expect(page.getByLabel('Current page')).toHaveText('codexGui');
  expect(stats.installs).toBe(0); expect(stats.connections).toBe(0); expect(stats.asks).toBe(0);
});

for (const width of [1440, 390]) {
  test(`help composer expands on any input and sends images at ${width}px`, async ({ page }) => {
    const stats = await mockBackend(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/help-assistant-harness.html');
    if (width === 390) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('button', { name: '问题解答助手', exact: true }).click();
    const panel = page.getByRole('dialog');
    const input = panel.getByRole('textbox');
    const send = panel.getByRole('button', { name: '发送', exact: true });
    await expect(input).toBeEnabled();
    const empty = (await input.boundingBox())!;
    const emptySend = (await send.boundingBox())!;
    expect(Math.abs(emptySend.y + emptySend.height / 2 - empty.y - empty.height / 2)).toBeLessThan(2);
    await expect(panel.locator('form')).not.toContainText('使用 Codex 中所选账户的额度');
    await page.screenshot({ path: `../../.codex-tmp/help-composer-empty-${width}.png`, animations: 'disabled' });
    await input.fill('a');
    await expect(input).toHaveAttribute('rows', '3');
    expect((await input.boundingBox())!.height).toBeGreaterThan(empty.height);
    await input.fill('');
    expect((await input.boundingBox())!.height).toBe(empty.height);
    await panel.locator('input[type="file"]').setInputFiles('src/components/helpAssistant/assistant-icon.jpg');
    await expect(panel.locator('form img')).toBeVisible();
    await expect(send).toBeEnabled();
    const box = (await input.locator('..').boundingBox())!;
    const inside = (await send.boundingBox())!;
    expect(inside.x + inside.width).toBeLessThan(box.x + box.width);
    expect(inside.y + inside.height).toBeLessThan(box.y + box.height);
    expect(box.y + box.height - inside.y - inside.height).toBeLessThan(10);
    await input.fill('这张图片里的功能怎么使用？');
    await page.screenshot({ path: `../../.codex-tmp/help-composer-image-${width}.png`, animations: 'disabled' });
    if (width === 1440) {
      await panel.screenshot({ path: '../../.codex-tmp/help-composer-image-panel.png', animations: 'disabled' });
    }
    await input.fill('');
    await send.click();
    await expect(panel.getByRole('log').getByRole('img')).toBeVisible();
    await expect(panel).toContainText('可以在 Codex 页面选择账户');
    expect(stats.requests[0]).toMatchObject({ args: { request: {
      question: '', images: [expect.stringMatching(/^data:image\/jpeg/)],
    } } });
  });
}
