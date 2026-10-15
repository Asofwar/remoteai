import { expect, type BrowserContext, type Page } from '@playwright/test';
import './chat-harness-types';

const NOW = new Date('2026-10-15T00:00:00Z');
const OLD_DURATION_SECONDS = 20 * 60;

async function openTimingHost(options: { context: BrowserContext; endpoint: string; blocked: boolean }) {
  const host = await options.context.newPage();
  await host.goto(`/e2e/chat-harness.html?role=desktop&demo&device=computer-one&title=Office%20timing`
    + `&blocked=${options.blocked}&socket=${encodeURIComponent(options.endpoint)}`);
  await expect(host.locator('#status')).toHaveText('registered');
  await host.evaluate(() => {
    const thread = window.chatTest.demoState().threads[0];
    thread.status = { type: 'active' };
    thread.turns![0].status = 'inProgress';
  });
  return host;
}

export async function checkRemoteTiming(options: {
  context: BrowserContext; page: Page; endpoint: string; blocked: boolean;
}) {
  const { page, endpoint, blocked } = options;
  const host = await openTimingHost(options);
  await page.bringToFront();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/e2e/remote-gui-harness.html?socket=${encodeURIComponent(endpoint)}`);
  await page.getByRole('button', { name: /^切换主机：/ }).click();
  await page.getByRole('menuitemradio', { name: /Office PC/ }).click();
  await expect(page.locator('.gui-remote-workspace:visible .chat-connection-status'))
    .toContainText(blocked ? 'Relay' : 'P2P', { timeout: 20_000 });
  // Connection fallback needs a progressing clock until its transport is selected.
  await host.clock.setFixedTime(NOW);
  await page.clock.setFixedTime(NOW);
  await page.getByRole('button', { name: 'Office timing', exact: true }).click();
  const status = page.locator('.gui-remote-workspace:visible .chat-processing-status');
  await expect(status).toContainText('(共计0秒)');
  await host.evaluate(startedAt => {
    window.chatTest.demoState().threads[0].turns![0].startedAt = startedAt;
  }, NOW.getTime() / 1000 - OLD_DURATION_SECONDS);
  // The desktop workspace polls history while the conversation stays mounted.
  await expect(status).toContainText('(共计20分0秒)', { timeout: 20_000 });
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await page.getByRole('textbox', { name: '聊天消息', exact: true }).fill('slow timing request');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(status).toContainText('(共计0秒)');
  await page.clock.setFixedTime(new Date(NOW.getTime() + 10_000));
  await expect(status).toContainText('(共计10秒)');
  await page.getByRole('button', { name: 'Office timing', exact: true }).click();
  await expect(status).toContainText('(共计20分10秒)');
  await page.screenshot({ path: `../../.codex-tmp/remote-timing-${blocked ? 'relay' : 'direct'}.png` });
  expect(await host.evaluate(() => window.chatTest.demoState().streamErrors)).toEqual([]);
}
