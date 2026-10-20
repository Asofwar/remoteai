import { expect, test } from '@playwright/test';
import reported from '../../../shared/chat/toolDetailsFixture.json' with { type: 'json' };

test('keeps tool output compact and copies the complete result', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('e2e/tool-details-harness.html');
  const outputs = page.locator('.chat-tool-markdown');
  await expect(outputs).toHaveCount(2);
  for (const output of await outputs.all()) {
    const copy = output.getByRole('button', { name: '复制完整内容' });
    const content = output.locator('.chat-markdown');
    const textBounds = (await content.boundingBox())!;
    const copyBounds = (await copy.boundingBox())!;
    expect(copyBounds.y).toBeLessThan(textBounds.y + textBounds.height);
    expect(copyBounds.x).toBeGreaterThanOrEqual(textBounds.x + textBounds.width);
    expect(await output.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(copy).toHaveText('');
  }
  await outputs.first().getByRole('button', { name: '复制完整内容' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(reported.result.content[0].text);
  await page.screenshot({ path: info.outputPath('tool-details.png') });
  await page.getByText('查看输入', { exact: true }).click();
  await expect(page.locator('details').first()).toContainText('"pid": 4296');
  await page.getByText('查看结构化结果', { exact: true }).click();
  await expect(page.locator('details').last()).toContainText('"elements": 100');
  await page.getByRole('button', { name: '返回上一层' }).click();
  await expect(outputs).toHaveCount(0);
});

test('keeps literal output and full-copy behavior while paging', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('e2e/tool-details-harness.html');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: 'literal', exact: true }).click();
  await expect(page.locator('.chat-code-block').last()).toContainText('<div>literal output</div>');
  await expect(page.locator('.chat-code-block').last()).toContainText('**keep these characters**');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: 'long', exact: true }).click();
  await page.getByRole('button', { name: '下一段', exact: true }).click();
  await expect(page.locator('.chat-tool-markdown')).toContainText('OUTPUT_END');
  await page.getByRole('button', { name: '复制完整内容' }).click();
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(copied.length).toBeGreaterThan(8_000);
  expect(copied).toMatch(/^Tool output line\.\n/);
  expect(copied).toMatch(/OUTPUT_END$/);
  await page.getByRole('button', { name: '上一段', exact: true }).click();
  await expect(page.getByRole('button', { name: '上一段', exact: true })).toBeDisabled();
});
