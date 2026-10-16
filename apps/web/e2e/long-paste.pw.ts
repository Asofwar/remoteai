import { expect, test } from '@playwright/test';

test('pastes large text as an intact attachment and keeps the composer responsive', async ({ page }, info) => {
  await page.route('**/test-suggestion', route => route.fulfill({ json: { suggestion: '' } }));
  await page.goto('e2e/composer-suggestion-harness.html');
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await input.fill('请分析：');
  const result = await input.evaluate(node => {
    const text = '你好 👩‍💻 <data>\t\n'.repeat(40_000);
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
    const start = performance.now(); node.dispatchEvent(event);
    return { prevented: event.defaultPrevented, duration: performance.now() - start, text };
  });
  expect(result.prevented).toBe(true); expect(result.duration).toBeLessThan(1000);
  await expect(page.getByRole('button', { name: /移除.*pasted-text-/ })).toBeVisible();
  await expect(input).toHaveValue('请分析：');
  await input.press('End'); await input.pressSequentially('继续输入');
  await expect(input).toHaveValue('请分析：继续输入');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('long-paste.png') });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const sent = await page.evaluate(() => JSON.parse(document.body.dataset.sent!));
  expect(sent.text).toBe('请分析：继续输入'); expect(sent.attachments).toHaveLength(1);
  expect(Buffer.from(sent.attachments[0].data, 'base64').toString('utf8')).toBe(result.text);
  await expect(input).toBeEmpty();
  console.log(`Web ${info.project.name} paste: ${result.duration.toFixed(1)} ms, ${result.text.length} characters`);
});
