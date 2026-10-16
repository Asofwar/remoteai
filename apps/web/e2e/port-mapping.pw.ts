import { expect, test } from '@playwright/test';
import type { MappingDocument } from '../../../shared/port-mapping/sync';

let servicePort: number;
let developmentPort: number;
test.beforeEach(async ({ request }) => {
  const state = await (await request.get('http://127.0.0.1:1496/state')).json();
  servicePort = state.servicePort;
  developmentPort = state.developmentPort;
  expect(Number.isInteger(servicePort)).toBe(true);
});

for (const mode of ['browser', 'hash']) test(`supports React Router ${mode} redirects and navigation`, async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(developmentPort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await page.getByRole('button', { name: '在 Remote AI 中预览' }).click();
  const path = mode === 'browser' ? '/router.html' : '/router.html?hash';
  await page.getByRole('textbox', { name: '网页路径' }).fill(path);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const preview = page.frameLocator('iframe[title="端口映射预览"]');
  await expect(preview.getByRole('heading', { name: 'Router login' })).toBeVisible();
  await preview.getByRole('link', { name: 'Next route' }).click();
  await expect(preview.getByRole('heading', { name: 'Router home' })).toBeVisible();
  await preview.getByRole('button', { name: 'Previous route' }).click();
  await expect(preview.getByRole('heading', { name: 'Router login' })).toBeVisible();
  const route = mode === 'browser' ? '/login' : '/router.html?hash#/login';
  await expect(page.getByRole('textbox', { name: '网页路径' })).toHaveValue(route);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Router login' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Check route isolation' }).click();
  await expect(preview.locator('#isolation')).toHaveText('SecurityError');
  expect(page.url()).toContain('/web/e2e/port-mapping-harness.html');
});

test('keeps preview browser storage isolated and available across refreshes', async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.evaluate(() => localStorage.setItem('mapping-secret', 'must-stay-in-host'));
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await page.getByRole('button', { name: '在 Remote AI 中预览' }).click();
  await page.getByRole('textbox', { name: '网页路径' }).fill('/browser-state');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const preview = page.frameLocator('iframe[title="端口映射预览"]');
  await expect(preview.locator('#state')).toHaveText('0 / available / isolated');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(preview.locator('#state')).toHaveText('1 / available / isolated');
  expect(await page.evaluate(() => localStorage.getItem('mapping-secret'))).toBe('must-stay-in-host');
  expect(await page.evaluate(() => localStorage.getItem('preview-count'))).toBeNull();
  await page.getByRole('dialog', { name: '端口映射预览' }).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '在 Remote AI 中预览' }).click();
  await page.getByRole('textbox', { name: '网页路径' }).fill('/browser-state');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(preview.locator('#state')).toHaveText('0 / available / isolated');
});

test('previews a real Vite app with a large module graph, CSS and concurrent lazy routes', async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(developmentPort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await page.getByRole('button', { name: '在 Remote AI 中预览' }).click();
  const preview = page.frameLocator('iframe[title="端口映射预览"]');
  await expect(preview.getByRole('heading', { name: 'Development app: 12720' })).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('body')).toHaveCSS('background-color', 'rgb(238, 246, 242)');
  await expect(page.locator('iframe[title="端口映射预览"]')).toHaveAttribute('data-ready', 'true');
  await preview.getByRole('button', { name: 'Open lazy page' }).click();
  await expect(preview.locator('#result')).toHaveText('Lazy page loaded / Lazy page loaded');
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-vite-${test.info().project.name}.png` });
});

test('distinguishes unavailable resources from script errors and recovers after navigation', async ({ page }) => {
  const diagnostics: string[] = [];
  page.on('console', message => {
    if (message.location().url.includes('previewBridge')) diagnostics.push(message.text());
  });
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await page.getByRole('button', { name: '在 Remote AI 中预览' }).click();
  for (const [path, message] of [
    ['/broken-resource', '部分网页资源无法加载，请检查服务后刷新。'],
    ['/broken-script', '网页运行出错，请检查网页后刷新。'],
    ['/broken-classic', '网页运行出错，请检查网页后刷新。'],
    ['/broken-async', '网页运行出错，请检查网页后刷新。'],
    ['/broken-cookie', '网页运行出错，请检查网页后刷新。'],
  ]) {
    await page.getByRole('textbox', { name: '网页路径' }).fill(path);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    expect((await page.getByRole('alert').boundingBox())!.width).toBeLessThanOrEqual(400);
  }
  expect(diagnostics).toContain('Port mapping preview: script-error cookie-access');
  expect(diagnostics).toContain('Port mapping preview: resource-error http-404-script');
  await page.getByRole('textbox', { name: '网页路径' }).fill('/');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('iframe[title="端口映射预览"]')
    .getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('retains overflow mappings and shows how to resume sync without blocking remote updates', async ({ page, context }) => {
  const base = Array.from({ length: 7 }, (_, index) => ({ id: `base-${index}`, remoteHost: '127.0.0.1',
    remotePort: 3000 + index, localPort: 13000 + index }));
  const extra = { id: 'local-extra', remoteHost: '127.0.0.1', remotePort: 5000, localPort: 15000 };
  let doc: MappingDocument = { revision: 1, mappings: [...base,
    { id: 'remote-extra', remoteHost: '127.0.0.1', remotePort: 4000, localPort: 14000 }] };
  let writes = 0;
  await context.addInitScript(({ base, extra }) => {
    const scope = JSON.stringify([location.origin, 'capacity', 'fixture-device']);
    localStorage.setItem('codex-port-forwarding:' + scope, JSON.stringify([...base, extra]));
    localStorage.setItem('codex-port-mapping-sync:' + scope, JSON.stringify({ [extra.id]: extra }));
  }, { base, extra });
  await context.route('**/devices/fixture-device/port-mappings', async route => {
    if (route.request().method() !== 'PUT') { await route.fulfill({ json: doc }); return; }
    writes++;
    const incoming = route.request().postDataJSON() as MappingDocument;
    expect(incoming.mappings.length).toBeLessThanOrEqual(8);
    const accepted = incoming.revision === doc.revision;
    if (accepted) doc = { revision: doc.revision + 1, mappings: incoming.mappings };
    await route.fulfill({ json: { ...doc, accepted } });
  });
  await page.goto('e2e/port-mapping-harness.html?sync=capacity');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  const notice = page.locator('.mapping-sync');
  await expect(notice).toContainText('多出的映射已保留在本机');
  await expect(page.getByRole('article')).toHaveCount(9);
  await notice.scrollIntoViewIfNeeded();
  const bounds = await notice.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(400);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-capacity-${test.info().project.name}.png` });
  doc = { revision: doc.revision + 1, mappings: doc.mappings.map(entry => entry.id === 'base-0'
    ? { ...entry, remotePort: 6000 } : entry) };
  await page.getByRole('button', { name: '按编辑时间排序' }).click();
  await expect(page.getByRole('article', { name: '127.0.0.1:6000', exact: true })).toBeVisible({ timeout: 12_000 });
  expect(writes).toBe(0);
  await expect(notice).toContainText('请删除不需要的映射后继续同步');
  await page.getByRole('article', { name: '127.0.0.1:6000', exact: true })
    .getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '删除映射' }).click();
  await expect(notice).toHaveText('配置已自动同步');
  await expect(page.getByRole('article')).toHaveCount(8);
  expect(doc.mappings.some(entry => entry.id === extra.id)).toBe(true);
});

test('automatically syncs edits and deletions between clients and isolates accounts', async ({ page, context }) => {
  const documents = new Map<string, MappingDocument>();
  await context.route('**/devices/fixture-device/port-mappings', async route => {
    const account = route.request().headers().authorization;
    let doc = documents.get(account) ?? { revision: 0, mappings: [] };
    if (route.request().method() === 'PUT') {
      const incoming = route.request().postDataJSON() as MappingDocument;
      const accepted = incoming.revision === doc.revision;
      if (accepted) { doc = { revision: doc.revision + 1, mappings: incoming.mappings }; documents.set(account, doc); }
      await route.fulfill({ json: { ...doc, accepted } });
    } else await route.fulfill({ json: doc });
  });
  await page.goto('e2e/port-mapping-harness.html?sync=first');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await expect(page.getByText('配置已自动同步')).toBeVisible();
  const second = await context.newPage();
  await second.goto('e2e/port-mapping-harness.html?sync=first');
  await second.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(second.getByRole('button', { name: '在 Remote AI 中预览' })).toBeDisabled();
  await second.getByRole('button', { name: '更多操作' }).click();
  await second.getByRole('menuitem', { name: '编辑映射' }).click();
  await second.getByRole('spinbutton', { name: '本地端口' }).fill('18306');
  await second.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('article')).toContainText('18306', { timeout: 12_000 });
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
  const other = await context.newPage();
  await other.goto('e2e/port-mapping-harness.html?sync=second');
  await other.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(other.getByText('配置已自动同步')).toBeVisible();
  await expect(other.getByRole('article')).toHaveCount(0);
  await second.getByRole('button', { name: '更多操作' }).click();
  await second.getByRole('menuitem', { name: '删除映射' }).click();
  await expect(page.getByRole('article')).toHaveCount(0, { timeout: 12_000 });
});

test('edits mapping settings, cancels drafts and persists the local port for other clients', async ({ page }) => {
  await page.goto('e2e/port-mapping-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('spinbutton', { name: '远程端口' }).fill(String(servicePort));
  await page.getByRole('button', { name: '添加并启动' }).click();
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '编辑映射' }).click();
  await page.getByRole('textbox', { name: '目标 IP' }).fill('::1');
  await page.getByRole('spinbutton', { name: '本地端口' }).fill('18306');
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-edit-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').locator('.mapping-details dd')).toHaveText([
    '::1', String(servicePort), '18306', /.+/,
  ]);
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '编辑映射' }).click();
  await page.getByRole('spinbutton', { name: '本地端口' }).fill('18307');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('18306');
  await page.reload(); await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(page.getByRole('article').locator('.mapping-details dd')).toHaveText([
    '::1', String(servicePort), '18306', /.+/,
  ]);
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeDisabled();
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '删除映射' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
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
  await expect(page.getByRole('article')).toHaveCount(2);
  for (const button of await page.getByRole('button', { name: '在 Remote AI 中预览' }).all()) {
    await expect(button).toBeEnabled();
  }
  const bounds = await page.getByRole('region', { name: '端口映射设置' }).boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(540);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: `../../.codex-tmp/port-mapping-target-${test.info().project.name}.png` });
  for (const host of ['127.0.0.1', '[::1]']) {
    await page.getByRole('button', { name: `http://${host}:${servicePort}`, exact: true }).click();
    const preview = page.frameLocator('iframe[title="端口映射预览"]');
    await expect(preview.getByRole('heading', { name: 'Port mapping works' })).toBeVisible();
    await expect(preview.locator('#socket')).toHaveText('Socket echo: hello');
    await preview.getByRole('button', { name: 'Fetch data' }).click();
    await expect(preview.locator('#result')).toHaveText('Mapped API response');
    await page.getByRole('dialog', { name: '端口映射预览' }).getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.reload(); await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(page.getByRole('switch', { name: '启动映射' })).toHaveCount(2);
  const ipv6 = page.getByRole('article', { name: `[::1]:${servicePort}`, exact: true });
  await ipv6.getByRole('switch', { name: '启动映射' }).click();
  await expect(ipv6.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
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
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
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
  await page.getByRole('dialog', { name: '端口映射预览' }).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('switch', { name: '停止映射' }).click();
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeDisabled();
  await page.getByRole('switch', { name: '启动映射' }).click();
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(page.getByRole('button', { name: '在 Remote AI 中预览' })).toBeDisabled();
});
