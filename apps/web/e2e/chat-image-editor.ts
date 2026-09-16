import { expect, type Page, type TestInfo, type APIRequestContext } from '@playwright/test';
import { connect, screenshot, state } from './chat-helpers';

async function draw(page: Page, touch: boolean) {
  const canvas = page.frameLocator('iframe[title="图片标注"]').locator('canvas');
  await canvas.click({ trial: true });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing annotation canvas');
  const start = { x: bounds.x + bounds.width * 0.2, y: bounds.y + bounds.height * 0.3 };
  const end = { x: bounds.x + bounds.width * 0.8, y: bounds.y + bounds.height * 0.6 };
  if (!touch) {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
    return;
  }
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function prepareDraft(page: Page) {
  await connect(page);
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: '相册', exact: true }).click();
  await (await chooser).setFiles(['../desktop/src-tauri/icons/128x128.png',
    '../desktop/src-tauri/icons/128x128.png']);
  const previews = page.locator('.chat-attachment-preview img');
  await expect(previews).toHaveCount(2);
  const original = await previews.first().getAttribute('src');
  return { previews, original };
}

async function exerciseEditor(page: Page, touch: boolean) {
  const editor = page.frameLocator('iframe[title="图片标注"]');
  const snapshot = () => editor.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const clean = await snapshot();
  await draw(page, touch);
  await expect.poll(async () => await snapshot() === clean).toBe(false);
  await expect(editor.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  const marked = await snapshot();
  await editor.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => await snapshot() === clean).toBe(true);
  await editor.getByRole('button', { name: '重做', exact: true }).click();
  expect(await snapshot()).toBe(marked);
  await editor.getByRole('button', { name: '箭头', exact: true }).click();
  await editor.getByRole('button', { name: '蓝色', exact: true }).click();
  await draw(page, touch);
  await editor.getByRole('button', { name: '方框', exact: true }).click();
  await editor.getByRole('button', { name: '红色', exact: true }).click();
  await draw(page, touch);
  const beforeResize = await snapshot();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await snapshot()).toBe(beforeResize);
  await page.setViewportSize({ width: 390, height: 844 });
}

export async function imageEditorJourney({ page, request, info }: {
  page: Page; request: APIRequestContext; info: TestInfo;
}) {
  const { previews, original } = await prepareDraft(page);
  const editor = page.frameLocator('iframe[title="图片标注"]');
  const open = async () => {
    await page.getByRole('button', { name: '标注图片 1', exact: true }).click();
    await expect(editor.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: '画笔', exact: true }).click();
  };
  await open();
  await draw(page, info.project.name === 'mobile');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await previews.first().getAttribute('src')).toBe(original);
  await open();
  await exerciseEditor(page, info.project.name === 'mobile');
  await screenshot(page, info, 'image-annotation');
  await editor.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  const edited = await previews.first().getAttribute('src');
  expect(edited).not.toBe(original);
  expect(await previews.nth(1).getAttribute('src')).toBe(original);
  await open();
  await editor.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await previews.first().getAttribute('src')).toBe(edited);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(async () => (await state(request)).operations.filter((item) => item.operation === 'send').length)
    .toBe(1);
  expect((await state(request)).operations.find((item) => item.operation === 'send')?.images).toEqual([edited, original]);
}
