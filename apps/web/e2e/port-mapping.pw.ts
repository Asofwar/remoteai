import { expect, test } from '@playwright/test';

let servicePort: number;
test.beforeEach(async ({ request }) => {
  const state = await (await request.get('http://127.0.0.1:1496/state')).json();
  servicePort = state.servicePort;
  expect(Number.isInteger(servicePort)).toBe(true);
});

test('JavaScript form handlers send exactly one POST from target, document and window', async ({ page, request }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await page.getByRole('button', { name: `http://127.0.0.1:${servicePort}`, exact: true }).click();
  const preview = page.frameLocator('iframe[title="端口映射预览"]');
  for (const handler of ['target', 'document', 'window']) {
    await page.getByRole('textbox', { name: '网页路径' }).fill(`/form-${handler}`);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'Send once' })).toBeVisible();
    const before = await (await request.get('http://127.0.0.1:1496/state')).json();
    await preview.getByRole('button', { name: 'Send once' }).click();
    await expect(preview.locator('#sent')).toHaveText('Sent once');
    // Wait past the deferred default action before checking the service's own request log.
    await page.waitForTimeout(250);
    const after = await (await request.get('http://127.0.0.1:1496/state')).json();
    const posts = after.requests.slice(before.requests.length).filter((item: { method: string }) => item.method === 'POST');
    expect(posts).toHaveLength(1);
    await expect(preview.locator('#sent')).toHaveText('Sent once');
  }
});

test('previews different IPs on the same port and restores their targets', async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  for (const host of ['127.0.0.1', '::1']) {
    await page.getByRole('textbox', { name: '目标 IP' }).fill(host);
    await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
    await page.getByRole('button', { name: '添加并启动' }).click();
  }
  await expect(page.getByRole('status')).toHaveText(['映射中', '映射中']);
  const bounds = await page.getByRole('region', { name: '端口映射设置' }).boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(400);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-target-${test.info().project.name}.png` });
  for (const host of ['127.0.0.1', '[::1]']) {
    await page.getByRole('button', { name: `http://${host}:${servicePort}`, exact: true }).click();
    const preview = page.frameLocator('iframe[title="端口映射预览"]');
    await expect(preview.getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
    await expect(preview.locator('#socket')).toHaveText('Socket echo: hello');
    await preview.getByRole('button', { name: 'Fetch data' }).click();
    await expect(preview.locator('#result')).toHaveText('Mapped API response');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.reload(); await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(['已停止', '已停止']);
  const ipv6 = page.getByRole('article', { name: `[::1]:${servicePort}`, exact: true });
  await ipv6.getByRole('button', { name: '启动映射' }).click();
  await expect(ipv6.getByRole('status')).toHaveText('映射中');
  await ipv6.getByRole('button', { name: `http://[::1]:${servicePort}`, exact: true }).click();
  await expect(page.frameLocator('iframe[title="端口映射预览"]')
    .getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
});

test('maps a real HTTP service with assets, modules, API calls, WebSocket and isolated navigation', async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.evaluate(() => localStorage.setItem('mapping-secret', 'must-stay-in-host'));
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await expect(page.getByRole('status')).toHaveText('映射中');
  await page.getByRole('button', { name: `http://127.0.0.1:${servicePort}`, exact: true }).click();
  const preview = page.frameLocator('iframe[title="端口映射预览"]');
  await expect(preview.getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
  await expect(page.locator('iframe[title="端口映射预览"]')).toHaveAttribute('data-ready', 'true');
  await expect(preview.locator('#module')).toHaveText('Module loaded');
  await expect(preview.locator('#socket')).toHaveText('Socket echo: hello');
  await expect(preview.locator('body')).toHaveAttribute('data-isolation', 'passed');
  await expect(preview.locator('body')).toHaveCSS('background-color', 'rgb(238, 246, 242)');
  await expect(preview.getByAltText('Mapped image')).toHaveJSProperty('naturalWidth', 48);
  await preview.getByRole('button', { name: 'Fetch data' }).click();
  await expect(preview.locator('#result')).toHaveText('Mapped API response');
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-web-${test.info().project.name}.png` });
  await preview.getByRole('link', { name: 'Next page' }).click();
  await expect(preview.getByRole('heading', { name: 'Second mapped page' })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
  await preview.getByRole('button', { name: 'Submit form' }).click();
  await expect(preview.getByRole('heading', { name: 'Received message=mapping' })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '停止映射' }).click();
  await expect(page.getByRole('status')).toHaveText('已停止');
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeDisabled();
  await page.getByRole('button', { name: '启动映射' }).click();
  await expect(page.getByRole('status')).toHaveText('映射中');
  await page.reload();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已停止');
});
