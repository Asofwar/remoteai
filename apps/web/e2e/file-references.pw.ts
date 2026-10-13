import { expect, test } from '@playwright/test';

test('matches remote files and folders, wraps paths and sends selected references', async ({ page }, testInfo) => {
  const requests: unknown[] = [];
  await page.route('**/web/test-suggestion', route => route.fulfill({ json: { suggestion: null } }));
  await page.route('**/web/test-project-files', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { directory: '/project', parent: null, truncated: false, entries: [
      { name: 'robot', path: '/project/service_business/log/src/main/java/com/robot', directory: true,
        relativePath: 'service_business/log/src/main/java/com/robot' },
      { name: 'RobotService.java', path: '/project/src/RobotService.java', directory: false,
        relativePath: 'src/RobotService.java' },
    ] } });
  });
  await page.goto('e2e/composer-suggestion-harness.html');
  const input = page.getByRole('textbox', { name: '聊天消息' });
  await input.fill('检查 %robot');
  const list = page.getByRole('menu', { name: '项目文件' });
  await expect(list.getByRole('menuitem')).toHaveCount(2);
  expect(requests).toEqual([{ cwd: '/project', threadId: 'remote', query: 'robot' }]);
  expect((await list.locator('..').boundingBox())!.width).toBeLessThanOrEqual(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width);
  await page.screenshot({ path: `../../.codex-tmp/file-references/web-${testInfo.project.name}.png` });
  if (testInfo.project.name === 'phone') await list.getByRole('menuitem').first().tap();
  else await input.press('Enter');
  await expect(input).toHaveValue('检查 ');
  await expect(page.locator('body')).not.toHaveAttribute('data-sent');
  await input.fill('检查 %RobotService');
  await expect(list.getByRole('menuitem')).toHaveCount(2);
  await input.press('ArrowDown'); await input.press('Tab');
  await expect(input).toHaveValue('检查 ');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const sent = JSON.parse((await page.locator('body').getAttribute('data-sent'))!);
  expect(sent.attachments).toEqual([
    { kind: 'folder', name: 'robot', path: '/project/service_business/log/src/main/java/com/robot' },
    { kind: 'file', name: 'RobotService.java', path: '/project/src/RobotService.java' },
  ]);
});
