import { expect, test } from '@playwright/test';

test('selects goal mode from slash search and removes the capsule without losing text', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**/__codex_switch__/api/invoke', async (route) => {
    const { command, args = {} } = route.request().postDataJSON();
    let result: unknown = {};
    if (command === 'codex_gui_cli_status') result = { version: '0.1.0' };
    if (command === 'codex_gui_connect') result = [];
    if (command === 'codex_gui_events') result = { cursor: { streamId: 'test', sequence: 1 }, reset: false, events: [] };
    if (command === 'codex_gui_model_settings') result = { threadId: null, selection: null, revision: 0 };
    if (command === 'codex_gui_usage_summary') result = { totalTokens: 0, estimatedCostUsd: 0,
      primaryRemainingPercent: null, primaryRemainingAggregated: false, providerEstimatedCost: null };
    if (command === 'codex_gui_request') result = { data: args.request.operation === 'plugins'
      ? { marketplaces: [], marketplaceLoadErrors: [] } : { data: [], nextCursor: null } };
    await route.fulfill({ json: { ok: true, result } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/e2e/gui-features-harness.html');
  const editor = page.getByRole('textbox', { name: '消息', exact: true });
  await expect(editor).toHaveAttribute('aria-disabled', 'false');
  await editor.fill('/goal');
  const menu = page.getByRole('listbox', { name: '命令和技能' });
  await expect(menu.getByRole('option', { name: /目标/ })).toBeVisible();
  await menu.getByRole('option', { name: /目标/ }).click();
  await expect(editor).toHaveText('');
  await expect(editor).toHaveAttribute('data-placeholder', '描述想完成的目标…');
  await editor.fill('完成登录页面并验证登录流程');
  const remove = page.getByRole('button', { name: '移除目标', exact: true });
  await expect(remove).toBeVisible();
  await page.screenshot({ path: '../../.codex-tmp/goal-mode/desktop.png', animations: 'disabled' });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(editor).toHaveText('完成登录页面并验证登录流程');
});
