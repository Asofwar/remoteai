import { expect, test, type Locator, type Page } from '@playwright/test';

const draft = Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 行：继续编辑这段长文本。`).join('\n');

async function openComposer(page: Page, withImage = false) {
  await page.route('**/test-suggestion', route => route.fulfill({ json: { suggestion: '' } }));
  await page.goto('e2e/composer-suggestion-harness.html');
  if (withImage) {
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 80;
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('选择相册图片', { exact: true }).setInputFiles({
      name: 'scroll.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
    });
    await expect(page.getByAltText('待发送图片 1')).toBeVisible();
  }
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await input.fill(draft);
  await input.press('Control+End');
  await page.locator('.chat-composer-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
  return input;
}

async function expectLastLineVisible(input: Locator) {
  await expect.poll(() => input.evaluate(node => {
    const input = node as HTMLTextAreaElement;
    const viewport = input.closest('.chat-composer-content')!;
    return {
      clipped: input.getBoundingClientRect().bottom > viewport.getBoundingClientRect().bottom + 1,
      innerScroll: input.scrollTop,
    };
  })).toEqual({ clipped: false, innerScroll: 0 });
}

for (const withImage of [false, true]) {
  test(`keeps the last line visible after scrolling and typing, image=${withImage}`, async ({ page }, info) => {
    const input = await openComposer(page, withImage);
    await expectLastLineVisible(input);
    await input.pressSequentially(' continued');
    await expectLastLineVisible(input);
    await input.press('Shift+Enter');
    await expectLastLineVisible(input);
    await input.dispatchEvent('compositionstart', { data: 'zhongwen' });
    await page.keyboard.insertText('中文输入仍然显示完整');
    await input.dispatchEvent('compositionend', { data: '中文输入仍然显示完整' });
    await expectLastLineVisible(input);
    await page.keyboard.insertText('自动换行后的末行也应完整可见。'.repeat(15));
    await expectLastLineVisible(input);
    await page.setViewportSize({ width: 320, height: 640 });
    await expectLastLineVisible(input);
    await page.screenshot({ path: info.outputPath('composer-last-line.png') });
    await input.fill('短文本');
    await expect.poll(() => input.evaluate(node => node.clientHeight)).toBeLessThan(100);
  });
}

test('keeps a middle edit in view without jumping to the end', async ({ page }) => {
  const input = await openComposer(page, true);
  const position = draft.indexOf('第 16 行');
  const before = await input.evaluate((node, position) => {
    const input = node as HTMLTextAreaElement;
    input.setSelectionRange(position, position);
    const viewport = input.closest('.chat-composer-content')!;
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight);
    viewport.scrollTop = input.offsetTop + 15 * lineHeight;
    return viewport.scrollTop;
  }, position);
  await page.keyboard.insertText('在中间修改：');
  await expect(input).toHaveValue(draft.slice(0, position) + '在中间修改：' + draft.slice(position));
  await expect.poll(() => input.evaluate(node => node.closest('.chat-composer-content')!.scrollTop))
    .toBeCloseTo(before, 0);
});
