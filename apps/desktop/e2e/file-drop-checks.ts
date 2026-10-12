import { expect, type Page } from '@playwright/test';
import './chat-harness-types';

export async function checkRemoteFileDrop(page: Page, host: Page) {
  const input = page.getByRole('textbox', { name: '聊天消息', exact: true });
  await input.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    window.remoteGuiFixture.pauseClipboard();
    window.remoteGuiFixture.dropFiles({ x: (bounds.x + bounds.width / 2) * devicePixelRatio,
      y: (bounds.y + bounds.height / 2) * devicePixelRatio });
  });
  await expect(page.getByText('正在添加附件…', { exact: true })).toBeVisible();
  const beats = await page.evaluate(() => window.remoteGuiFixture.beats());
  await input.fill('检查拖入的图片和文件');
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.remoteGuiFixture.beats())).toBeGreaterThan(beats + 4);
  await page.evaluate(() => window.remoteGuiFixture.releaseClipboard());
  const preview = page.getByRole('img', { name: '待发送图片 1', exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.chat-composer-capsules:visible')).toContainText('notes.txt');
  await page.screenshot({ path: '../../.codex-tmp/gui-remote-file-drop.png' });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => host.evaluate(() => window.chatTest.demoState().operations
    .filter(operation => operation.operation === 'send').at(-1))).toMatchObject({
    text: '检查拖入的图片和文件', images: [expect.stringMatching(/^data:image\//)],
    attachments: [{ kind: 'file', name: 'notes.txt', data: 'ZHJvcHBlZCBub3Rlcw==' }],
  });
  expect(JSON.stringify(await host.evaluate(() => window.chatTest.demoState().operations
    .filter(operation => operation.operation === 'send').at(-1)))).not.toContain('C:\\private');
  await expect(preview).toHaveCount(0);
}
