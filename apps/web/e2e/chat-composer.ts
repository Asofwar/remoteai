import { expect, type Page } from '@playwright/test';
import { connect } from './chat-helpers';

export async function composerLayout(page: Page) {
  await connect(page);
  const input = page.getByRole('textbox', { name: '聊天消息' });
  const send = page.getByRole('button', { name: '发送消息' });
  const add = page.getByRole('button', { name: '添加内容', exact: true });
  const settings = page.getByRole('button', { name: /聊天设置/ });
  await expect(settings).toBeVisible();
  await expect(page.locator('.chat-composer')).toHaveClass(/is-compact/);
  await expect(send).toHaveCSS('border-radius', '50%');
  for (const text of ['一行消息', '第一行\n第二行\n第三行', '多行消息\n'.repeat(60)]) {
    await input.fill(text);
    const content = (await page.locator('.chat-composer-content').boundingBox())!;
    const left = (await add.boundingBox())!;
    const right = (await send.boundingBox())!;
    expect(left.y).toBeGreaterThanOrEqual(content.y + content.height - 1);
    expect(right.y).toBe(left.y);
    expect(right.y + right.height).toBeLessThan(page.viewportSize()!.height);
    expect(right.width).toBe(right.height);
    await expect(settings).toBeVisible();
  }
  await input.fill('');
  await expect(send).toBeDisabled();
  await expect(page.locator('.chat-composer')).toHaveClass(/is-compact/);
  await page.evaluate(() => {
    if (!window.visualViewport) throw new Error('Visual viewport is required');
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => innerHeight - 300 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(settings).toBeVisible();
  await settings.click();
  await expect(page.getByRole('button', { name: '设置推理强度' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await input.blur();
  await expect(settings).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await input.fill('窄屏长消息\n'.repeat(40));
  await expect(send).toBeInViewport();
  await expect(settings).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
