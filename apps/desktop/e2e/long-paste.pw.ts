import { expect, test } from '@playwright/test';

test('large formatted paste stays out of the editor and sends intact as an attachment', async ({ page }, info) => {
  await page.goto('/e2e/long-paste-harness.html');
  const input = page.getByRole('textbox', { name: '消息', exact: true });
  await input.fill('请分析：');
  const result = await input.evaluate(node => {
    const text = '你好 👩‍💻 <data>\t\n'.repeat(40_000);
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    clipboardData.setData('text/html', '<span style="color:red">code</span><br>'.repeat(40_000));
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
    const start = performance.now();
    node.dispatchEvent(event);
    return { prevented: event.defaultPrevented, duration: performance.now() - start, text };
  });
  expect(result.prevented).toBe(true);
  expect(result.duration).toBeLessThan(1000);
  await expect(page.getByRole('button', { name: /^移除附件：pasted-text-/ })).toBeVisible();
  await expect(input).toHaveText('请分析：');
  const beats = Number(await page.getByLabel('刷新次数').textContent());
  await input.press('End'); await input.pressSequentially('继续输入');
  await expect(input).toHaveText('请分析：继续输入');
  await expect.poll(async () => Number(await page.getByLabel('刷新次数').textContent())).toBeGreaterThan(beats);
  await page.screenshot({ path: info.outputPath('long-paste-desktop.png') });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const sent = await page.evaluate(() => JSON.parse(document.body.dataset.sent!));
  expect(sent.text).toBe('请分析：继续输入');
  expect(sent.attachments).toHaveLength(1);
  expect(Buffer.from(sent.attachments[0].data, 'base64').toString('utf8')).toBe(result.text);
  await expect(input).toBeEmpty();
  await expect(page.getByRole('button', { name: /^移除附件：/ })).toHaveCount(0);
  console.log(`Desktop paste handler: ${result.duration.toFixed(1)} ms, ${result.text.length} characters`);
});
