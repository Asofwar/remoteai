import { readFile } from 'node:fs/promises';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { connect, settled, state } from './chat-helpers';

export async function clipboardJourney(page: Page, request: APIRequestContext) {
  await connect(page);
  await expect(page.getByRole('status').filter({ hasText: 'P2P' })).toBeVisible({ timeout: 16_000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await input.fill('保留草稿');
  await input.press('End');
  await page.evaluate(() => navigator.clipboard.writeText('和粘贴的文字'));
  await input.press('Control+V');
  await expect(input).toHaveValue('保留草稿和粘贴的文字');
  const image = await readFile('../desktop/src-tauri/icons/32x32.png');
  await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  }, image.toString('base64'));
  await input.press('Control+V');
  await expect(page.getByRole('img', { name: '待发送图片 1' })).toBeVisible();
  // Browser clipboard writers do not support arbitrary OS files; exercise the native paste-event payload.
  await input.evaluate((node, base64) => {
    const clipboardData = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    clipboardData.items.add(new File([bytes], 'second.png', { type: 'image/png' }));
    clipboardData.items.add(new File(['pasted document'], 'notes.txt', { type: 'text/plain' }));
    clipboardData.items.add(new File(['unknown file type'], 'sample.dat'));
    clipboardData.setData('text/plain', 'Do not insert file names into the draft');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, image.toString('base64'));
  await expect(page.getByRole('img', { name: '待发送图片 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: '移除notes.txt' })).toBeVisible();
  await expect(page.getByRole('button', { name: '移除sample.dat' })).toBeVisible();
  await expect(input).toHaveValue('保留草稿和粘贴的文字');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await settled(page);
  const sent = (await state(request)).operations.findLast(entry => entry.operation === 'send');
  expect(sent?.text).toBe('保留草稿和粘贴的文字');
  expect(sent?.images).toHaveLength(2);
  expect(sent?.attachments).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'notes.txt', data: Buffer.from('pasted document').toString('base64') }),
    expect.objectContaining({ name: 'sample.dat', data: Buffer.from('unknown file type').toString('base64') }),
  ]));
}
