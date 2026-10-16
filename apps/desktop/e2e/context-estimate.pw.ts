import { expect, test } from '@playwright/test';
import { modelSettingsBackend } from './model-settings-backend';

for (const width of [390, 1280]) {
  test(`shows engine context usage during active requests and compaction at ${width}px`, async ({ page }, info) => {
    const backend = modelSettingsBackend();
    await backend.attach(page.context());
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto('/e2e/model-settings-harness.html');
      await page.getByRole('button', { name: '对话 a', exact: true }).click();
      backend.startTurn('a');
      const usage = { total: { totalTokens: 8_744_228 }, last: { totalTokens: 206_357 },
        contextTokens: 247_017, modelContextWindow: 258_400 };
      backend.contextUsage('a', usage);
      await expect(page.getByText('上下文 247K / 258.4K Token（96% 已用）', { exact: true })).toBeVisible();
      const contextButton = page.getByRole('button', { name: '查看上下文用量', exact: true });
      await contextButton.click();
      await expect(page.getByText('96% 已用（剩余 4%）', { exact: true })).toBeVisible();
      const beats = Number(await page.getByLabel('刷新次数').textContent());
      await page.getByLabel('聊天消息').fill('界面仍可输入');
      await expect(page.getByLabel('聊天消息')).toHaveValue('界面仍可输入');
      await expect.poll(async () => Number(await page.getByLabel('刷新次数').textContent())).toBeGreaterThan(beats);
      if (await contextButton.getAttribute('aria-expanded') !== 'true') await contextButton.click();
      await page.screenshot({ path: info.outputPath(`context-estimate-${width}.png`), animations: 'disabled' });
      backend.contextUsage('a', { ...usage, contextTokens: 16_273, last: { totalTokens: 16_273 } });
      await expect(page.getByText('6% 已用（剩余 94%）', { exact: true })).toBeVisible();
      await expect(page.getByText('上下文 16.3K / 258.4K Token（6% 已用）', { exact: true })).toBeVisible();
    } finally { backend.releaseUsage(); }
  });
}
