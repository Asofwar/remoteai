import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('region', { name: '端口映射设置' });
const entry = (page: Page, label: string) => panel(page).getByRole('article', { name: label });
declare global {
  interface Window {
    portForwardingFixture: {
      targetUrls: string[]; clipboard: string[]; browserUrls: string[]; previewUrls: string[];
      resolvedUrls: string[]; failBrowser: boolean;
    };
  }
}
async function add(page: Page, remotePort: number, localPort: number) {
  await panel(page).getByRole('spinbutton', { name: '远程端口' }).fill(String(remotePort));
  await panel(page).getByRole('spinbutton', { name: '本地端口' }).fill(String(localPort));
  await panel(page).getByRole('button', { name: '添加并启动' }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/port-forwarding-harness.html');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
});

test('maps a selected IP and restores it after reload', async ({ page }) => {
  await panel(page).getByRole('textbox', { name: '目标 IP' }).fill('192.168.1.20:3000');
  await add(page, 3000, 13000);
  await expect(panel(page).getByRole('alert')).toHaveText('请输入有效的 IPv4 或 IPv6 地址。');
  await panel(page).getByRole('textbox', { name: '目标 IP' }).fill('192.168.1.20');
  await panel(page).getByRole('button', { name: '添加并启动' }).click();
  await expect(entry(page, '192.168.1.20:3000 → 13000').getByRole('status')).toHaveText('映射中');
  expect(await page.evaluate(() => window.portForwardingFixture.targetUrls)).toEqual(['http://192.168.1.20:3000']);
  await page.reload(); await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(entry(page, '192.168.1.20:3000 → 13000').getByRole('status')).toHaveText('已停止');
  await entry(page, '192.168.1.20:3000 → 13000').getByRole('button', { name: /^启动映射/ }).click();
  expect(await page.evaluate(() => window.portForwardingFixture.targetUrls)).toEqual(['http://192.168.1.20:3000']);
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-target-ip.png', animations: 'disabled' });
});

test('edits an active mapping, cancels drafts and retains the edited settings after reload', async ({ page }) => {
  await add(page, 3000, 13000);
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: /^编辑映射/ }).click();
  await panel(page).getByRole('spinbutton', { name: '本地端口' }).fill('14000');
  await panel(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('映射中');
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: /^编辑映射/ }).click();
  await panel(page).getByRole('textbox', { name: '目标 IP' }).fill('172.16.200.85');
  await panel(page).getByRole('spinbutton', { name: '远程端口' }).fill('8306');
  await panel(page).getByRole('spinbutton', { name: '本地端口' }).fill('8306');
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-edit.png' });
  await panel(page).getByRole('button', { name: '保存修改' }).click();
  await expect(panel(page).getByRole('article')).toHaveCount(1);
  await expect(entry(page, '172.16.200.85:8306 → 8306').getByRole('status')).toHaveText('映射中');
  await add(page, 3000, 13000); // The original listener was released and its port is reusable.
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('映射中');
  await page.reload(); await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(entry(page, '172.16.200.85:8306 → 8306').getByRole('status')).toHaveText('已停止');
});

test('multiple mappings, port conflicts, stop, copy and reconnect stay independent', async ({ page }) => {
  await add(page, 3000, 13000); await add(page, 5432, 15432);
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('映射中');
  await expect(entry(page, '127.0.0.1:5432 → 15432').getByRole('status')).toHaveText('映射中');
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '复制本地地址 127.0.0.1:3000 → 13000' }).click();
  expect(await page.evaluate(() => window.portForwardingFixture.clipboard)).toEqual(['127.0.0.1:13000']);
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '停止映射 127.0.0.1:3000 → 13000' }).click();
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('已停止');
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '127.0.0.1:13000' })).toBeDisabled();
  await expect(entry(page, '127.0.0.1:5432 → 15432').getByRole('status')).toHaveText('映射中');
  await add(page, 8080, 9999);
  await expect(entry(page, '127.0.0.1:8080 → 9999').getByRole('alert')).toHaveText('本地端口已被占用，请换一个端口。');
  await entry(page, '127.0.0.1:8080 → 9999').getByRole('button', { name: '删除映射 127.0.0.1:8080 → 9999' }).click();
  await add(page, 8080, 15432);
  await expect(panel(page).getByRole('alert')).toHaveText('这个本地端口已有映射。');
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('button', { name: '断开连接', exact: true }).click();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await expect(entry(page, '127.0.0.1:5432 → 15432').getByRole('status')).toHaveText('已停止');
  await expect(panel(page).getByRole('button', { name: '启动映射 127.0.0.1:5432 → 15432' })).toBeDisabled();
  await expect(entry(page, '127.0.0.1:5432 → 15432').getByRole('button', { name: '127.0.0.1:15432' })).toBeDisabled();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  await panel(page).getByRole('button', { name: '启动映射 127.0.0.1:5432 → 15432' }).click();
  await expect(entry(page, '127.0.0.1:5432 → 15432').getByRole('status')).toHaveText('映射中');
});

test('opens the mapped local address in the preview drawer and system browser', async ({ page }) => {
  await add(page, 3000, 13000);
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '127.0.0.1:13000' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: '在 Remote AI 中预览' })).toBeVisible();
  expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(400);
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-link-menu.png', animations: 'disabled' });
  await menu.getByRole('menuitem', { name: '在 Remote AI 中预览' }).click();
  await expect(page.getByRole('region', { name: '网页预览' })).toContainText('http://127.0.0.1:13000');
  await expect.poll(() => page.evaluate(() => window.portForwardingFixture.previewUrls))
    .toContain('http://127.0.0.1:13000');
  await expect(panel(page)).toBeHidden();
  await page.getByRole('button', { name: '在浏览器中打开', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.portForwardingFixture.browserUrls))
    .toEqual(['http://127.0.0.1:13000']);
  await page.getByRole('button', { name: '关闭详情抽屉' }).click();
  await page.getByRole('button', { name: '端口映射', exact: true }).click();
  const address = entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '127.0.0.1:13000' });
  await address.focus(); await page.keyboard.press('Enter');
  await menu.getByRole('menuitem', { name: '在浏览器中打开' }).click();
  await expect.poll(() => page.evaluate(() => window.portForwardingFixture.browserUrls))
    .toEqual(['http://127.0.0.1:13000', 'http://127.0.0.1:13000']);
  expect(await page.evaluate(() => window.portForwardingFixture.resolvedUrls)).toEqual([]);
  await expect(panel(page)).toBeHidden();
});

test('reports browser failures without exposing internal details', async ({ page }) => {
  await add(page, 3000, 13000);
  await page.evaluate(() => { window.portForwardingFixture.failBrowser = true; });
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '127.0.0.1:13000' }).click();
  await page.getByRole('menuitem', { name: '在浏览器中打开' }).click();
  await expect(page.getByText('链接暂时无法打开，请稍后重试。')).toBeVisible();
  await expect(page.getByText('Private browser failure')).toHaveCount(0);
});

test('keeps mappings by computer, restores settings, and fits compact light and dark views', async ({ page }) => {
  await add(page, 3000, 13000);
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-light.png', animations: 'disabled' });
  const launcher = page.getByRole('button', { name: '端口映射', exact: true });
  const forwarding = await launcher.boundingBox();
  const desktop = await page.getByRole('button', { name: '打开远程桌面' }).boundingBox();
  expect(forwarding!.x + forwarding!.width).toBeLessThan(desktop!.x);
  await launcher.click(); await page.getByRole('button', { name: '切换电脑' }).click();
  await launcher.click(); await expect(panel(page)).toContainText('还没有端口映射');
  await launcher.click(); await page.getByRole('button', { name: '切换电脑' }).click();
  await launcher.click(); await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('映射中');
  await page.reload(); await launcher.click();
  await expect(entry(page, '127.0.0.1:3000 → 13000').getByRole('status')).toHaveText('已停止');
  for (const width of [1280, 560]) {
    await page.setViewportSize({ width, height: 800 });
    const bounds = await panel(page).boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(400);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await launcher.click(); await page.getByRole('button', { name: '切换深色' }).click(); await launcher.click();
  await expect(entry(page, '127.0.0.1:3000 → 13000')).toBeVisible();
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '启动映射 127.0.0.1:3000 → 13000' }).click();
  await entry(page, '127.0.0.1:3000 → 13000').getByRole('button', { name: '127.0.0.1:13000' }).click();
  await expect(page.getByRole('menuitem', { name: '在 Remote AI 中预览' })).toBeVisible();
  const menuBounds = await page.getByRole('menu').boundingBox();
  expect(menuBounds!.width).toBeLessThanOrEqual(400);
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(560);
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-dark.png', animations: 'disabled' });
});
