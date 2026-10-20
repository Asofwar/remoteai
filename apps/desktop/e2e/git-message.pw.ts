import { expect, test } from '@playwright/test';

for (const width of [390, 820]) {
  test(`AI message controls and selected commit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/git-actions.html');
    const message = page.getByRole('textbox', { name: '提交说明', exact: true });
    const auto = page.getByRole('checkbox', { name: '自动生成提交说明', exact: true });
    const commit = page.locator('.git-commit-actions button').first();
    await expect(message).toHaveAttribute('placeholder', '填写提交说明，或按 Tab 用 AI 生成');
    await page.getByRole('checkbox', { name: '选择 src/app.ts', exact: true }).check();
    await message.focus();
    await message.press('Tab');
    await expect(message).toHaveValue('feat: 更新 src/app.ts');
    await expect(message).toBeEditable();
    await expect(page.getByRole('button', { name: '查看 src/app.ts', exact: true })).toBeVisible();
    await message.fill('');
    await auto.check();
    await expect(message).toBeDisabled();
    await expect(commit).toBeEnabled();
    await page.screenshot({ path: info.outputPath('automatic-message.png'), animations: 'disabled' });
    const options = (await page.locator('.git-message-options').boundingBox())!;
    expect(options.x + options.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: '提交并推送', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('提交并推送完成');
    await expect(page.getByRole('button', { name: '查看 src/app.ts', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '查看 README.md', exact: true })).toBeVisible();
  });
}

test('Tab leaves existing text intact and Shift+Tab retains normal navigation', async ({ page }) => {
  await page.goto('/e2e/git-actions.html');
  await page.getByRole('checkbox', { name: '选择 src/app.ts', exact: true }).check();
  const message = page.getByRole('textbox', { name: '提交说明', exact: true });
  await message.focus(); await message.press('Shift+Tab');
  await expect(message).toHaveValue('');
  await message.fill('handwritten'); await message.press('Tab');
  await expect(message).toHaveValue('handwritten');
});
