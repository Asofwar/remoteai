import { expect, test } from '@playwright/test';

for (const scenario of ['connecting', 'permission']) {
  test(`keeps ${scenario} status text and its action fully visible`, async ({ page }, info) => {
    if (scenario === 'connecting') await page.addInitScript(() => {
      RTCPeerConnection.prototype.createOffer = () => new Promise(() => undefined);
    });
    await page.goto(`e2e/remote-desktop-harness.html${scenario === 'permission' ? '?macos&permissions' : ''}`);
    await page.getByRole('button', { name: '打开工具', exact: true }).click();
    await page.getByRole('button', { name: '远程桌面', exact: true }).click();
    const message = page.locator('.rd-status > span');
    await expect(message).toContainText(scenario === 'connecting' ? '正在连接桌面…' : '请在 Mac 上允许屏幕录制');
    await expect(page.locator('.rd-status button')).toHaveText(scenario === 'connecting' ? '重新连接' : '检查授权');
    const layout = await message.evaluate(element => {
      const text = element.getBoundingClientRect();
      const container = element.parentElement!.getBoundingClientRect();
      const button = element.parentElement!.querySelector('button')!.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: text.width, height: text.height, lineHeight: parseFloat(style.lineHeight),
        padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        contained: text.top >= container.top && text.bottom <= container.bottom && button.bottom <= container.bottom,
        onscreen: container.left >= 0 && container.right <= innerWidth && container.bottom <= innerHeight };
    });
    expect(layout.lineHeight).toBeGreaterThanOrEqual(22);
    expect(layout.padding).toBe(4);
    expect(Math.ceil(layout.height)).toBeGreaterThanOrEqual(layout.lineHeight + layout.padding);
    expect(layout.width).toBeLessThanOrEqual(400);
    expect(layout.contained).toBe(true);
    expect(layout.onscreen).toBe(true);
    await page.screenshot({ path: info.outputPath(`${scenario}-status.png`) });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  });
}
