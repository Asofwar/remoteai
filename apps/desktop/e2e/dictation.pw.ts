import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { mockDictationBackend, openDictation } from './dictation-fixture';

test.use({ permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

for (const dark of [false, true]) {
  test(`records real WebM and appends a retried transcription (${dark ? 'dark' : 'light'})`, async ({ page }, info) => {
    await page.setViewportSize({ width: dark ? 390 : 1280, height: 900 });
    const backend = await mockDictationBackend(page);
    const editor = await openDictation(page, dark);
    const microphone = page.getByRole('button', { name: '语音输入', exact: true });
    const send = page.getByRole('button', { name: '发送消息', exact: true });
    await editor.fill('已有文字');
    await expect(send).toBeEnabled();
    const micBounds = (await microphone.boundingBox())!;
    const sendBounds = (await send.boundingBox())!;
    expect(micBounds.x + micBounds.width).toBeLessThanOrEqual(sendBounds.x);
    expect(sendBounds.x - micBounds.x - micBounds.width).toBeLessThanOrEqual(10);
    await page.screenshot({ path: info.outputPath('microphone.png') });
    await microphone.click();
    const stop = page.getByRole('button', { name: '结束录音并转写', exact: true });
    await expect(stop).toBeVisible();
    await expect(send).toBeDisabled();
    await editor.press('Enter');
    expect(backend.calls.some(call => call.operation === 'send')).toBe(false);
    const panel = page.getByRole('status').filter({ hasText: '正在录音' });
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(400);
    await expect(panel).toContainText('0:01');
    expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    expect(await panel.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + 8, rect.y + 8));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath('recording.png') });
    await stop.click();
    await expect.poll(() => backend.uploads.length).toBe(1);
    expect(backend.uploads[0].mimeType).toContain('audio/webm');
    const audio = Buffer.from(backend.uploads[0].data, 'base64');
    expect(audio.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    await writeFile(info.outputPath('recording.webm'), audio);
    await expect(page.getByText('正在转写…', { exact: true })).toBeVisible();
    await expect(send).toBeDisabled();
    await editor.fill('已有文字和录音期间的补充');
    backend.reply({ error: '转写失败，请重试。' });
    await page.getByRole('button', { name: '重试转写' }).click();
    await expect.poll(() => backend.uploads.length).toBe(2);
    expect(backend.uploads[1]).toEqual(backend.uploads[0]);
    backend.reply({ text: '请帮我检查项目代码。' });
    await expect(editor).toHaveText('已有文字和录音期间的补充\n请帮我检查项目代码。');
    await expect(editor).toBeFocused();
    await expect(send).toBeEnabled();
    expect(backend.calls.some(call => call.operation === 'send')).toBe(false);
    await page.screenshot({ path: info.outputPath('transcribed.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('cancels recording and ignores late transcription after cancellation', async ({ page }) => {
  const backend = await mockDictationBackend(page);
  const editor = await openDictation(page);
  await editor.fill('保留草稿');
  await page.getByRole('button', { name: '语音输入', exact: true }).click();
  await expect(page.getByText('正在录音', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消语音输入' }).click();
  await expect.poll(() => backend.cancelled.length).toBe(1);
  expect(backend.uploads).toHaveLength(0);
  await page.getByRole('button', { name: '语音输入', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '正在录音' })).toContainText('0:01');
  await page.getByRole('button', { name: '结束录音并转写' }).click();
  await expect.poll(() => backend.uploads.length).toBe(1);
  await page.getByRole('button', { name: '取消语音输入' }).click();
  backend.reply({ text: '不能回填' });
  await expect(editor).toHaveText('保留草稿');
  await expect(page.getByRole('button', { name: '语音输入', exact: true })).toBeEnabled();
});
