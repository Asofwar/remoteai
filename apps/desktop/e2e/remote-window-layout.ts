import { expect, type Page } from '@playwright/test';

export async function checkRemoteWindowLayout(page: Page) {
  const workspace = page.locator('.gui-remote-workspace:visible');
  const header = workspace.locator('.chat-header');
  await expect(header).toHaveAttribute('data-tauri-drag-region');
  await expect(header.locator('h2')).toHaveAttribute('data-tauri-drag-region');
  expect(await header.locator('button[data-tauri-drag-region]').count()).toBe(0);
  await page.getByRole('button', { name: '进入专注模式', exact: true }).click();
  const controls = header.locator('.window-controls');
  const close = controls.locator('.window-control-close');
  const headerBounds = (await header.boundingBox())!;
  const closeBounds = (await close.boundingBox())!;
  expect(closeBounds.x + closeBounds.width).toBeCloseTo(headerBounds.x + headerBounds.width, 0);
  expect(closeBounds.y).toBeCloseTo(headerBounds.y, 0);
  expect(closeBounds.height).toBe(headerBounds.height);
  const scroll = workspace.getByLabel('聊天记录', { exact: true });
  const footer = workspace.locator('.chat-message-footer');
  const conversation = (await workspace.locator('.chat-conversation').boundingBox())!;
  const scrollBounds = (await scroll.boundingBox())!;
  expect(scrollBounds.y + scrollBounds.height).toBeCloseTo(conversation.y + conversation.height, 0);
  expect(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(2);
  const footerBounds = (await footer.boundingBox())!;
  await scroll.hover({ position: { x: 200, y: 200 } });
  await page.mouse.wheel(0, -400);
  await expect(page.getByRole('button', { name: '回到底部', exact: true })).toBeVisible();
  expect((await footer.boundingBox())!.y).toBeCloseTo(footerBounds.y, 0);
  await page.getByRole('button', { name: '回到底部', exact: true }).click();
  await expect.poll(() => scroll.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThan(2);
  const lastMessage = (await scroll.locator('[data-message-id]').last().boundingBox())!;
  expect(lastMessage.y + lastMessage.height).toBeLessThanOrEqual((await footer.boundingBox())!.y);
  await page.getByRole('textbox', { name: '聊天消息', exact: true }).fill('窗口布局检查草稿');
  await page.screenshot({ path: '../../.codex-tmp/remote-window-layout.png' });
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click();
  await expect(controls).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '聊天消息', exact: true })).toHaveValue('窗口布局检查草稿');
}
