import { expect, test } from '@playwright/test';

test('all five AI edits send the original and preserve the composer draft', async ({ page }) => {
  await page.goto('/e2e/image-ai-harness.html');
  const tools = [
    ['标注', '描述标注的位置、内容和样式'], ['添加评论', '描述评论的位置和文字内容'],
    ['移除背景', '可补充需要保留的主体'], ['擦除', '描述要擦除的物体或区域'],
    ['调整大小', '可补充裁剪或留白要求'],
  ];
  for (const [name, hint] of tools) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByLabel(hint).fill('左下角');
    if (name === '调整大小') {
      await page.getByLabel('宽度（像素）').fill('1200');
      await page.getByLabel('高度（像素）').fill('800');
    }
    await page.getByRole('button', { name: '交给 AI 编辑' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByTestId('result')).toContainText('"original":true');
    await expect(page.getByTestId('result')).toContainText('调用 AI 图片编辑能力');
    await expect(page.getByLabel('消息草稿')).toHaveValue('保留我的草稿');
    await page.getByRole('button', { name: '打开预览' }).click();
  }
});

test('mask and toolbar adapt to desktop and phone sizes', async ({ page }, info) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/e2e/image-ai-harness.html');
    const dialog = page.locator('dialog');
    await expect(dialog).toHaveCSS('background-color', width === 390 ? 'rgb(0, 0, 0)' : 'rgba(0, 0, 0, 0)');
    await expect(page.getByRole('button', { name: '调整大小', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`preview-${width}.png`) });
    await page.getByRole('button', { name: '调整大小', exact: true }).click();
    await page.getByRole('button', { name: '交给 AI 编辑' }).click();
    await expect(page.getByRole('alert')).toHaveText('宽高请输入 1–16384 之间的整数。');
    await page.screenshot({ path: info.outputPath(`form-${width}.png`) });
  }
});
