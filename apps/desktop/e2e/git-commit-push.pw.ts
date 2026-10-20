import { expect, test } from '@playwright/test';

for (const width of [390, 820]) {
  test(`commit and push stays to the right of commit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/git-actions.html');
    const commit = page.locator('.git-commit-actions button').first();
    const push = page.getByRole('button', { name: '提交并推送', exact: true });
    await expect(commit).toBeDisabled();
    await expect(push).toBeDisabled();
    await page.getByRole('checkbox', { name: '选择 src/app.ts', exact: true }).check();
    await expect(push).toBeDisabled();
    await page.getByRole('textbox', { name: '提交说明', exact: true }).fill('提交并推送所选文件');
    await expect(commit).toBeEnabled();
    await expect(push).toBeEnabled();
    const left = (await commit.boundingBox())!;
    const right = (await push.boundingBox())!;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(right.y).toBe(left.y);
    expect(right.height).toBe(left.height);
    expect(right.x + right.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath('commit-and-push.png'), animations: 'disabled' });
    await push.click();
    await expect(page.getByRole('status')).toHaveText('提交并推送完成');
    await expect(page.getByRole('button', { name: '查看 src/app.ts', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '查看 README.md', exact: true })).toBeVisible();
    await expect(push).toBeDisabled();
  });
}
